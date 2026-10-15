import asyncio
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional
import pytest
from app.config import settings
from app.services.render_service import RenderService
from app.core.ffmpeg import ffmpeg_service, FFmpegService


# ============================================================================
# 1. TEMPORARY FILE AND STORAGE SAFETY TESTS
# ============================================================================

def test_phase51_cleanup_deferred_safety(tmp_path, monkeypatch):
    """Verifies that temp file cleanup is safely deferred and preserves all files without schema tracking."""
    mock_storage = tmp_path / "mock_storage"
    mock_storage.mkdir(parents=True, exist_ok=True)
    mock_temp = mock_storage / "temp"
    mock_temp.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "STORAGE_ROOT", str(mock_storage))

    # 1. Fresh file (< 24h old)
    fresh_file = mock_temp / "transform_fresh_123.mp4"
    fresh_file.write_text("dummy-fresh-data")

    # 2. Older file (> 24h old, e.g. 25 hours old)
    old_file = mock_temp / "fallback_old_456.mp4"
    old_file.write_text("dummy-old-data")
    old_mtime = time.time() - (25 * 3600)
    os.utime(old_file, (old_mtime, old_mtime))

    # Run cleanup with default 24h (86400s) threshold
    cleaned = RenderService.cleanup_orphaned_temp_files(max_age_seconds=86400.0)

    # Must safely return 0 and preserve all files to prevent unrecoverable data loss
    assert cleaned == 0
    assert fresh_file.exists(), "Fresh temporary file must be preserved"
    assert old_file.exists(), "Older temporary file must be preserved since ownership cannot be proven"


def test_phase51_cleanup_outside_storage_safety(tmp_path, monkeypatch):
    """Verifies that cleanup rejects directory if outside STORAGE_ROOT."""
    mock_storage = tmp_path / "storage_a"
    mock_storage.mkdir()
    outside_temp = tmp_path / "outside_dir" / "temp"
    outside_temp.mkdir(parents=True)

    monkeypatch.setattr(settings, "STORAGE_ROOT", str(mock_storage))

    cleaned = RenderService.cleanup_orphaned_temp_files()
    assert cleaned == 0


# ============================================================================
# 2. SYNCHRONOUS COMPATIBILITY WRAPPER TESTS
# ============================================================================

def test_phase51_ffmpeg_close_proc_transport_safety():
    """Verifies synchronous _close_proc_transport handles None, reaps running processes via poll(), and closes transports safely."""
    ffmpeg_service._close_proc_transport(None)

    class MockUnderlying:
        def __init__(self):
            self.polled = False
            self.returncode = None

        def poll(self):
            self.polled = True
            self.returncode = 1
            return 1

    class MockTransport:
        def __init__(self):
            self.closed = False
            self._closed = False
            self._proc = MockUnderlying()

        def close(self):
            self.closed = True
            self._closed = True

    class RunningProc:
        def __init__(self):
            self.returncode = None
            self.killed = False
            self._transport = MockTransport()

        def kill(self):
            self.killed = True

    running_proc = RunningProc()
    ffmpeg_service._close_proc_transport(running_proc)
    assert running_proc.killed is True
    assert running_proc._transport._proc.polled is True
    assert running_proc._transport.closed is True

    class CompletedProc:
        def __init__(self):
            self.returncode = 0
            self.killed = False
            self._transport = MockTransport()

        def kill(self):
            self.killed = True

    comp_proc = CompletedProc()
    ffmpeg_service._close_proc_transport(comp_proc)
    assert comp_proc.killed is False
    assert comp_proc._transport._proc.polled is False
    assert comp_proc._transport.closed is True


# ============================================================================
# 3. ASYNCHRONOUS SUBPROCESS LIFECYCLE & OWNERSHIP REGRESSION TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_phase51_subprocess_successful_completion():
    """1. Verifies that normal successful process exit skips kill() and immediately closes transport."""
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "import sys; sys.exit(0)",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    await proc.communicate()
    assert proc.returncode == 0

    # Running async cleanup on already-exited process
    await ffmpeg_service._cleanup_proc(proc)
    assert proc._transport._closed is True


@pytest.mark.asyncio
async def test_phase51_subprocess_cancellation_and_reap_real():
    """Verifies that an asyncio subprocess is safely terminated and reaped when cancelled."""
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "import time; time.sleep(10)",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

    try:
        assert proc.returncode is None
    finally:
        await ffmpeg_service._cleanup_proc(proc, timeout=2.0)

    assert proc.returncode is not None, "Child process must be reaped"
    assert proc._transport._closed is True


@pytest.mark.asyncio
async def test_phase51_subprocess_single_wait_task():
    """3. Verifies that exactly one wait task is created per subprocess cleanup lifecycle."""
    created_tasks = []

    class MockTransport:
        def __init__(self):
            self._closed = False

        def close(self):
            self._closed = True

    class MockProc:
        def __init__(self):
            self.pid = 88888
            self.returncode = None
            self._transport = MockTransport()
            self.kill_called = False

        def kill(self):
            self.kill_called = True

        async def wait(self):
            await asyncio.sleep(0.01)
            self.returncode = 0
            return 0

    proc = MockProc()
    old_create_task = asyncio.create_task

    def tracked_create_task(coro, **kwargs):
        t = old_create_task(coro, **kwargs)
        if "ffmpeg_wait_" in kwargs.get("name", ""):
            created_tasks.append(t)
        return t

    try:
        asyncio.create_task = tracked_create_task
        await ffmpeg_service._cleanup_proc(proc, timeout=0.5)
    finally:
        asyncio.create_task = old_create_task

    assert len(created_tasks) == 1, "Must create exactly one wait task"
    assert proc.returncode == 0


@pytest.mark.asyncio
async def test_phase51_subprocess_deadline_expiration_and_handoff():
    """4. Verifies that when the local deadline expires, wait_task is transferred to _lingering_processes uncancelled."""
    class MockHungProc:
        def __init__(self):
            self.pid = 99991
            self.returncode = None
            self.killed = False
            self._transport = None

        def kill(self):
            self.killed = True

        async def wait(self):
            await asyncio.sleep(10)
            self.returncode = 0
            return 0

    proc = MockHungProc()
    try:
        await ffmpeg_service._cleanup_proc(proc, timeout=0.05)

        # Must have transferred to lingering registry
        assert proc.pid in ffmpeg_service._lingering_processes
        entry = ffmpeg_service._lingering_processes[proc.pid]
        assert entry["proc"] is proc
        assert not entry["wait_task"].done(), "Wait task must NOT be cancelled on handoff"
        assert entry["status"] == "LINGERING_MONITORED"
        assert proc.returncode is None, "Must NOT claim returncode when exit unconfirmed"
    finally:
        # Clean registry
        entry = ffmpeg_service._lingering_processes.pop(proc.pid, None)
        if entry:
            entry["wait_task"].cancel()


@pytest.mark.asyncio
async def test_phase51_subprocess_repeated_cancellation():
    """5. Verifies that repeated cancellation during cleanup does not reset the deadline and propagates cancellation."""
    class MockSlowProc:
        def __init__(self):
            self.pid = 99992
            self.returncode = None
            self._transport = None

        def kill(self):
            pass

        async def wait(self):
            await asyncio.sleep(0.3)
            self.returncode = 0
            return 0

    proc = MockSlowProc()

    async def worker():
        try:
            await asyncio.sleep(5)
        finally:
            await ffmpeg_service._cleanup_proc(proc, timeout=0.1)

    task = asyncio.create_task(worker())
    await asyncio.sleep(0.01)
    # First cancel
    task.cancel()
    await asyncio.sleep(0.01)
    # Second cancel during cleanup
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task

    # Process exceeded 0.1s timeout, so it should be in lingering registry
    assert proc.pid in ffmpeg_service._lingering_processes
    entry = ffmpeg_service._lingering_processes.pop(proc.pid, None)
    if entry:
        entry["wait_task"].cancel()


@pytest.mark.asyncio
async def test_phase51_subprocess_cancellation_during_operational_unwind():
    """6. Verifies that when an operational exception is active, unwinding preserves the exception even if cancelled during cleanup."""
    class CustomOperationalError(RuntimeError):
        pass

    class MockSlowProc:
        def __init__(self):
            self.pid = 99993
            self.returncode = None
            self._transport = None

        def kill(self):
            pass

        async def wait(self):
            await asyncio.sleep(0.2)
            self.returncode = 0
            return 0

    proc = MockSlowProc()

    async def failing_operation():
        try:
            raise CustomOperationalError("Operational database failure")
        finally:
            await ffmpeg_service._cleanup_proc(proc, timeout=0.5)

    task = asyncio.create_task(failing_operation())
    await asyncio.sleep(0.02)
    # Cancellation arrives while cleanup is actively awaiting wait_task
    task.cancel()

    with pytest.raises(CustomOperationalError) as exc_info:
        await task

    assert "Operational database failure" in str(exc_info.value)


@pytest.mark.asyncio
async def test_phase51_subprocess_cleanup_failure_isolation():
    """7. Verifies that internal cleanup failures (e.g. kill() throwing) do not mask operational exceptions."""
    class CustomOperationalError(RuntimeError):
        pass

    class MockBrokenProc:
        def __init__(self):
            self.pid = 99994
            self.returncode = None
            self._transport = None

        def kill(self):
            raise PermissionError("Access denied when sending kill signal")

        async def wait(self):
            await asyncio.sleep(0.01)
            self.returncode = 1
            return 1

    proc = MockBrokenProc()

    async def operation():
        try:
            raise CustomOperationalError("Root business error")
        finally:
            await ffmpeg_service._cleanup_proc(proc, timeout=0.1)

    with pytest.raises(CustomOperationalError) as exc_info:
        await operation()

    assert "Root business error" in str(exc_info.value)


@pytest.mark.asyncio
async def test_phase51_subprocess_registry_insertion_failure(monkeypatch):
    """8. Verifies that catastrophic failure during registry insertion is caught without masking caller outcome."""
    class MockHungProc:
        def __init__(self):
            self.pid = 99995
            self.returncode = None
            self._transport = None

        def kill(self):
            pass

        async def wait(self):
            await asyncio.sleep(5)
            self.returncode = 0
            return 0

    proc = MockHungProc()

    # Simulate catastrophic dict insertion failure
    class BrokenDict(dict):
        def __setitem__(self, key, value):
            raise MemoryError("Out of memory during dict allocation")

    monkeypatch.setattr(ffmpeg_service, "_lingering_processes", BrokenDict())

    # Should not raise MemoryError; handles catastrophic limitation cleanly
    await ffmpeg_service._cleanup_proc(proc, timeout=0.01)
    assert proc.returncode is None


@pytest.mark.asyncio
async def test_phase51_subprocess_callback_registration_failure(monkeypatch):
    """9. Verifies that callback registration failure keeps entry in registry marked with limitation."""
    class MockHungProc:
        def __init__(self):
            self.pid = 99996
            self.returncode = None
            self._transport = None

        def kill(self):
            pass

        async def wait(self):
            await asyncio.sleep(5)
            self.returncode = 0
            return 0

    proc = MockHungProc()

    old_create_task = asyncio.create_task

    def mock_broken_task(coro, **kwargs):
        task = old_create_task(coro, **kwargs)
        orig_add = task.add_done_callback

        def selective_broken_add(fn):
            # Allow asyncio.wait internal waiter callback (_on_completion) to succeed,
            # but fail the lingering done callback registration in _cleanup_proc
            if getattr(fn, "__name__", "") != "_on_completion":
                raise RuntimeError("Callback queue failure")
            return orig_add(fn)

        task.add_done_callback = selective_broken_add
        return task

    monkeypatch.setattr(asyncio, "create_task", mock_broken_task)

    try:
        await ffmpeg_service._cleanup_proc(proc, timeout=0.01)
        assert proc.pid in ffmpeg_service._lingering_processes
        entry = ffmpeg_service._lingering_processes[proc.pid]
        assert entry["status"] == "REGISTERED_CALLBACK_FAILED"
    finally:
        entry = ffmpeg_service._lingering_processes.pop(proc.pid, None)
        if entry:
            entry["wait_task"].cancel()


@pytest.mark.asyncio
async def test_phase51_subprocess_wait_task_failure_handling():
    """10. Verifies that wait_task cancellation or failure retains unresolved entry without closing transport."""
    proc = type("MockProc", (), {"returncode": None, "_transport": None})()
    task = asyncio.create_task(asyncio.sleep(0.01))
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    ffmpeg_service._lingering_processes[99997] = {
        "proc": proc,
        "wait_task": task,
        "status": "LINGERING_MONITORED"
    }

    # Invoke callback directly with cancelled task
    ffmpeg_service._on_lingering_done(99997, proc, task)

    assert 99997 in ffmpeg_service._lingering_processes
    entry = ffmpeg_service._lingering_processes.pop(99997)
    assert entry["status"] == "TASK_CANCELLED_EXIT_UNCONFIRMED"


@pytest.mark.asyncio
async def test_phase51_subprocess_identity_safe_registry_removal():
    """11. Verifies that registry removal occurs only after confirmed exit and verified task identity."""
    class MockTransport:
        def __init__(self):
            self._closed = False
        def close(self):
            self._closed = True

    proc = type("MockProc", (), {"returncode": 0, "_transport": MockTransport()})()

    async def finished_wait():
        return 0

    task = asyncio.create_task(finished_wait())
    await task

    ffmpeg_service._lingering_processes[99998] = {
        "proc": proc,
        "wait_task": task,
        "status": "LINGERING_MONITORED"
    }

    # A. Stale task callback should be ignored
    other_task = asyncio.create_task(finished_wait())
    await other_task
    ffmpeg_service._on_lingering_done(99998, proc, other_task)
    assert 99998 in ffmpeg_service._lingering_processes

    # B. Matching identity callback removes entry and closes transport
    ffmpeg_service._on_lingering_done(99998, proc, task)
    assert 99998 not in ffmpeg_service._lingering_processes
    assert proc._transport._closed is True


@pytest.mark.asyncio
async def test_phase51_subprocess_shutdown_resolved_and_unresolved():
    """12. Verifies service shutdown awaits resolved tasks and marks unresolved tasks truthfully without fake reap."""
    class MockTransport:
        def __init__(self):
            self._closed = False
        def close(self):
            self._closed = True

    # 1. Resolving process
    proc_resolved = type("MockProc", (), {"returncode": None, "_transport": MockTransport()})()
    async def quick_wait():
        await asyncio.sleep(0.01)
        proc_resolved.returncode = 0
        return 0
    task_resolved = asyncio.create_task(quick_wait())

    # 2. Unresolved process
    proc_unresolved = type("MockProc", (), {"returncode": None, "_transport": MockTransport(), "kill": lambda: None})()
    async def hung_wait():
        await asyncio.sleep(10)
        return 0
    task_unresolved = asyncio.create_task(hung_wait())

    ffmpeg_service._lingering_processes[80001] = {
        "proc": proc_resolved,
        "wait_task": task_resolved,
        "status": "LINGERING_MONITORED"
    }
    ffmpeg_service._lingering_processes[80002] = {
        "proc": proc_unresolved,
        "wait_task": task_unresolved,
        "status": "LINGERING_MONITORED"
    }

    try:
        # Run shutdown with short timeout
        await ffmpeg_service.shutdown(timeout=0.1)

        # Resolved should be reaped and popped
        assert 80001 not in ffmpeg_service._lingering_processes
        assert proc_resolved._transport._closed is True

        # Unresolved should remain retained as SHUTDOWN_TIMEOUT_UNRESOLVED
        assert 80002 in ffmpeg_service._lingering_processes
        entry = ffmpeg_service._lingering_processes[80002]
        assert entry["status"] == "SHUTDOWN_TIMEOUT_UNRESOLVED"
        assert proc_unresolved.returncode is None, "Must not claim returncode for unresolved process"
        assert proc_unresolved._transport._closed is True
    finally:
        task_unresolved.cancel()
        ffmpeg_service._lingering_processes.clear()


@pytest.mark.asyncio
async def test_phase51_subprocess_shutdown_expired_deadline_no_positive_wait():
    """Verifies that an expired or zero-timeout shutdown does not wait for any positive duration."""
    class MockProc:
        def __init__(self):
            self.pid = 88801
            self.returncode = None
            self._transport = None

        def kill(self):
            pass

    proc = MockProc()

    async def hung():
        await asyncio.sleep(10)

    task = asyncio.create_task(hung())

    ffmpeg_service._lingering_processes[88801] = {
        "proc": proc,
        "wait_task": task,
        "status": "LINGERING_MONITORED"
    }

    try:
        t0 = time.monotonic()
        await ffmpeg_service.shutdown(timeout=0.0)
        elapsed = time.monotonic() - t0

        assert elapsed < 0.05, f"Shutdown waited unexpectedly long on expired deadline: {elapsed}s"
        assert 88801 in ffmpeg_service._lingering_processes
        entry = ffmpeg_service._lingering_processes[88801]
        assert entry["status"] == "SHUTDOWN_TIMEOUT_UNRESOLVED"
    finally:
        task.cancel()
        ffmpeg_service._lingering_processes.clear()


# ============================================================================
# 4. EXISTING INTEGRATION TESTS PRESERVED
# ============================================================================

@pytest.mark.asyncio
async def test_phase51_auxiliary_task_gather_resilience():
    """13. Verifies that auxiliary failures in asyncio.gather with return_exceptions=True do not raise or crash."""
    async def failing_aux():
        raise RuntimeError("Auxiliary step failed")

    async def successful_aux():
        return True

    results = await asyncio.gather(
        failing_aux(),
        successful_aux(),
        return_exceptions=True
    )

    assert isinstance(results[0], RuntimeError)
    assert results[1] is True


@pytest.mark.asyncio
async def test_phase51_parent_cancellation_preservation():
    """14. Verifies that cancelling a parent task awaiting asyncio.gather raises CancelledError and is not swallowed."""
    async def long_running_aux():
        await asyncio.sleep(5)

    async def parent_job():
        try:
            await asyncio.gather(
                long_running_aux(),
                long_running_aux(),
                return_exceptions=True
            )
        except Exception:
            pass

    task = asyncio.create_task(parent_job())
    await asyncio.sleep(0.05)
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task


@pytest.mark.asyncio
async def test_phase51_subprocess_substantial_pipe_output():
    """15. Verifies that concurrent stderr draining handles substantial stdout/stderr streams without deadlock."""
    py_code = (
        "import sys\n"
        "sys.stdout.buffer.write(b'A' * 131072)\n"
        "sys.stdout.flush()\n"
        "sys.stderr.buffer.write(b'B' * 131072)\n"
        "sys.stderr.flush()\n"
    )

    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        py_code,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

    stderr_task = None
    try:
        stderr_task = asyncio.create_task(proc.stderr.read())
        stdout_data = await proc.stdout.read()
        stderr_data = await stderr_task
        await proc.wait()

        assert proc.returncode == 0
        assert len(stdout_data) == 131072
        assert len(stderr_data) == 131072
    finally:
        if stderr_task and not stderr_task.done():
            stderr_task.cancel()
        await ffmpeg_service._cleanup_proc(proc)


@pytest.mark.asyncio
async def test_phase51_subprocess_exception_preservation():
    """16. Verifies that exceptions during subprocess execution are not masked or suppressed by _cleanup_proc."""
    class CustomSubprocessError(RuntimeError):
        pass

    async def failing_operation():
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-c",
            "import time; time.sleep(10)",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        try:
            raise CustomSubprocessError("Explicit operational failure")
        finally:
            await ffmpeg_service._cleanup_proc(proc)

    with pytest.raises(CustomSubprocessError) as exc_info:
        await failing_operation()

    assert "Explicit operational failure" in str(exc_info.value)


# ============================================================================
# 5. AI JOB SERVICE SYNCHRONIZATION AND FAILURE PROPAGATION REGRESSION TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_phase51_ai_job_duplicate_waiter_shields_worker():
    """17. Verifies duplicate caller waits for active worker via asyncio.shield without double execution."""
    import uuid
    from sqlalchemy import select
    from app.main import init_db
    from app.core.database import AsyncSessionLocal
    from app.models.ai_models import AIJob
    from app.services.ai_job_service import AIJobService, _active_ai_tasks

    await init_db()
    job_id = f"test-shield-{uuid.uuid4()}"
    worker_finished = False

    async with AsyncSessionLocal() as session:
        job = AIJob(
            id=job_id,
            project_id="test-proj",
            job_type="text_to_video",
            provider="mock",
            prompt="test prompt",
            status="running",
            progress_percent=10.0,
            job_metadata={}
        )
        session.add(job)
        await session.commit()

    async def mock_worker():
        await asyncio.sleep(0.05)
        nonlocal worker_finished
        worker_finished = True
        async with AsyncSessionLocal() as s:
            res = await s.execute(select(AIJob).where(AIJob.id == job_id))
            j = res.scalar_one()
            j.status = "completed"
            await s.commit()

    worker_task = asyncio.create_task(mock_worker())
    _active_ai_tasks[job_id] = worker_task

    try:
        await AIJobService._process_job(job_id, "test-proj", "text_to_video", "test prompt", {})
        assert worker_finished is True
        async with AsyncSessionLocal() as s:
            res = await s.execute(select(AIJob).where(AIJob.id == job_id))
            j = res.scalar_one()
            assert j.status == "completed"
    finally:
        _active_ai_tasks.pop(job_id, None)
        if not worker_task.done():
            worker_task.cancel()


@pytest.mark.asyncio
async def test_phase51_ai_job_duplicate_waiter_observes_completion():
    """18. Verifies that duplicate caller waits and observes completed status when worker completes."""
    import uuid
    from sqlalchemy import select
    from app.main import init_db
    from app.core.database import AsyncSessionLocal
    from app.models.ai_models import AIJob
    from app.services.ai_job_service import AIJobService, _active_ai_tasks

    await init_db()
    job_id = f"test-compl-{uuid.uuid4()}"

    async with AsyncSessionLocal() as session:
        job = AIJob(
            id=job_id,
            project_id="test-proj",
            job_type="text_to_video",
            provider="mock",
            prompt="test prompt",
            status="running",
            progress_percent=20.0,
            job_metadata={}
        )
        session.add(job)
        await session.commit()

    async def worker():
        await asyncio.sleep(0.04)
        async with AsyncSessionLocal() as s:
            res = await s.execute(select(AIJob).where(AIJob.id == job_id))
            j = res.scalar_one()
            j.status = "completed"
            await s.commit()

    worker_task = asyncio.create_task(worker())
    _active_ai_tasks[job_id] = worker_task

    try:
        await AIJobService._process_job(job_id, "test-proj", "text_to_video", "test prompt", {})
        async with AsyncSessionLocal() as s:
            res = await s.execute(select(AIJob).where(AIJob.id == job_id))
            j = res.scalar_one()
            assert j.status == "completed"
    finally:
        _active_ai_tasks.pop(job_id, None)
        if not worker_task.done():
            worker_task.cancel()


@pytest.mark.asyncio
async def test_phase51_ai_job_duplicate_waiter_observes_failure():
    """19. Verifies that when worker task fails with exception, waiter returns without crash and records failed status."""
    import uuid
    from sqlalchemy import select
    from app.main import init_db
    from app.core.database import AsyncSessionLocal
    from app.models.ai_models import AIJob
    from app.services.ai_job_service import AIJobService, _active_ai_tasks

    await init_db()
    job_id = f"test-fail-{uuid.uuid4()}"

    async with AsyncSessionLocal() as session:
        job = AIJob(
            id=job_id,
            project_id="test-proj",
            job_type="text_to_video",
            provider="mock",
            prompt="test prompt",
            status="running",
            progress_percent=20.0,
            job_metadata={}
        )
        session.add(job)
        await session.commit()

    async def failing_worker():
        await asyncio.sleep(0.03)
        async with AsyncSessionLocal() as s:
            res = await s.execute(select(AIJob).where(AIJob.id == job_id))
            j = res.scalar_one()
            j.status = "failed"
            j.error_message = "Simulated GPU Out of Memory"
            await s.commit()
        raise RuntimeError("Worker process crash")

    worker_task = asyncio.create_task(failing_worker())
    _active_ai_tasks[job_id] = worker_task

    try:
        await AIJobService._process_job(job_id, "test-proj", "text_to_video", "test prompt", {})
        async with AsyncSessionLocal() as s:
            res = await s.execute(select(AIJob).where(AIJob.id == job_id))
            j = res.scalar_one()
            assert j.status == "failed"
            assert "Simulated GPU Out of Memory" in j.error_message
    finally:
        _active_ai_tasks.pop(job_id, None)
        if not worker_task.done():
            worker_task.cancel()


@pytest.mark.asyncio
async def test_phase51_ai_job_waiter_cancelled_worker_unaffected():
    """20. Verifies that cancelling the duplicate waiter does NOT cancel the underlying background worker."""
    import uuid
    from sqlalchemy import select
    from app.main import init_db
    from app.core.database import AsyncSessionLocal
    from app.models.ai_models import AIJob
    from app.services.ai_job_service import AIJobService, _active_ai_tasks

    await init_db()
    job_id = f"test-cancel-{uuid.uuid4()}"
    worker_completed = False

    async with AsyncSessionLocal() as session:
        job = AIJob(
            id=job_id,
            project_id="test-proj",
            job_type="text_to_video",
            provider="mock",
            prompt="test prompt",
            status="running",
            progress_percent=15.0,
            job_metadata={}
        )
        session.add(job)
        await session.commit()

    async def long_worker():
        await asyncio.sleep(0.08)
        nonlocal worker_completed
        worker_completed = True
        async with AsyncSessionLocal() as s:
            res = await s.execute(select(AIJob).where(AIJob.id == job_id))
            j = res.scalar_one()
            j.status = "completed"
            await s.commit()

    worker_task = asyncio.create_task(long_worker())
    _active_ai_tasks[job_id] = worker_task

    try:
        waiter_task = asyncio.create_task(
            AIJobService._process_job(job_id, "test-proj", "text_to_video", "test prompt", {})
        )
        await asyncio.sleep(0.02)

        waiter_task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await waiter_task

        assert not worker_task.done(), "Background worker must NOT be cancelled by waiter cancellation"
        assert not worker_task.cancelled(), "Worker task must not have cancelled status"

        await worker_task
        assert worker_completed is True

        async with AsyncSessionLocal() as s:
            res = await s.execute(select(AIJob).where(AIJob.id == job_id))
            j = res.scalar_one()
            assert j.status == "completed"
    finally:
        _active_ai_tasks.pop(job_id, None)
        if not worker_task.done():
            worker_task.cancel()


@pytest.mark.asyncio
async def test_phase51_ai_job_task_registry_identity_safe_cleanup():
    """21. Verifies that _process_job finally block only removes its own task and preserves replacement tasks."""
    import uuid
    from app.main import init_db
    from app.core.database import AsyncSessionLocal
    from app.models.ai_models import AIJob
    from app.services.ai_job_service import AIJobService, _active_ai_tasks

    await init_db()
    job_id = f"test-reg-{uuid.uuid4()}"

    async with AsyncSessionLocal() as session:
        job = AIJob(
            id=job_id,
            project_id="test-proj",
            job_type="text_to_video",
            provider="mock",
            prompt="test prompt",
            status="completed",
            progress_percent=100.0,
            job_metadata={}
        )
        session.add(job)
        await session.commit()

    replacement_task = asyncio.create_task(asyncio.sleep(0.05))
    _active_ai_tasks[job_id] = replacement_task

    try:
        old_task = asyncio.create_task(
            AIJobService._process_job(job_id, "test-proj", "text_to_video", "test prompt", {})
        )
        await old_task

        assert _active_ai_tasks.get(job_id) is replacement_task, (
            "Old task finally block must not remove replacement task from registry"
        )
    finally:
        replacement_task.cancel()
        _active_ai_tasks.pop(job_id, None)
