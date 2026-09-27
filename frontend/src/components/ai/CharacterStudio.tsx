import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Palette,
  ShieldCheck,
  Tag,
  Eye,
  Shirt,
  Scissors,
  Edit2,
  Save,
  X,
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';

const DEFAULT_COLOR_PALETTES = [
  ['#D97706', '#1E293B', '#B91C1C', '#047857'],
  ['#2563EB', '#F59E0B', '#111827', '#E11D48'],
  ['#7C3AED', '#0D9488', '#374151', '#F97316'],
];

export const CharacterStudio: React.FC = () => {
  const { activeProject } = useProjectStore();
  const { showNotification } = useUIStore();
  const [characters, setCharacters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    tamilName: string;
    age: number;
    gender: string;
    appearance: string;
    clothing: string;
    hair: string;
    skin: string;
    visualStyle: string;
    personality: string;
    culturalMarkers: string;
    colorPalette: string[];
    isLocked: boolean;
  }>({
    name: '',
    tamilName: '',
    age: 25,
    gender: 'Male',
    appearance: '',
    clothing: '',
    hair: '',
    skin: '',
    visualStyle: 'Cinematic Photorealistic',
    personality: '',
    culturalMarkers: '',
    colorPalette: DEFAULT_COLOR_PALETTES[0],
    isLocked: false,
  });

  // 12 Locked Consistency Attributes Form State
  const [name, setName] = useState('');
  const [tamilName, setTamilName] = useState('');
  const [age, setAge] = useState(28);
  const [gender, setGender] = useState('Male');
  const [appearance, setAppearance] = useState('');
  const [clothing, setClothing] = useState('');
  const [hair, setHair] = useState('');
  const [skin, setSkin] = useState('');
  const [visualStyle, setVisualStyle] = useState('Cinematic Photorealistic');
  const [personality, setPersonality] = useState('');
  const [culturalMarkers, setCulturalMarkers] = useState('');
  const [colorPalette, setColorPalette] = useState<string[]>([
    '#D97706',
    '#1E293B',
    '#B91C1C',
    '#047857',
  ]);
  const [isLocked, setIsLocked] = useState(true);

  const loadCharacters = async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/ai/projects/${activeProject.id}/characters`);
      setCharacters(res.data);
    } catch {
      setCharacters([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCharacters();
  }, [activeProject]);

  const handlePopulatePreset = () => {
    setName('Karthik');
    setTamilName('கார்த்திக்');
    setAge(28);
    setGender('Male');
    setAppearance('Sharp jawline, expressive dark brown eyes, athletic build, subtle stubble');
    setClothing('Tailored crisp white cotton shirt, charcoal trousers, rolled sleeves');
    setHair('Textured black wavy hair, modern side-part');
    setSkin('Warm dusky South Indian complexion');
    setVisualStyle('Cinematic Photorealistic');
    setPersonality('Resolute, charismatic, restrained emotional intensity');
    setCulturalMarkers('Subtle sacred ash (vibhooti) forehead mark, silver thread bracelet');
    setColorPalette(['#D97706', '#1E293B', '#B91C1C', '#047857']);
    setIsLocked(true);
  };

  const handleCreateCharacter = async () => {
    if (!activeProject || !name.trim()) return;
    try {
      await api.post(`/ai/projects/${activeProject.id}/characters`, {
        name: name.trim(),
        tamil_name: tamilName.trim() || undefined,
        age,
        gender,
        appearance: appearance.trim() || undefined,
        clothing: clothing.trim() || undefined,
        hair: hair.trim() || undefined,
        skin: skin.trim() || undefined,
        visual_style: visualStyle,
        personality: personality.trim() || undefined,
        is_locked: isLocked,
        metadata_info: {
          cultural_markers: culturalMarkers.trim() || undefined,
          color_palette: colorPalette,
          negative_prompt: `no alterations to ${name}'s face, skin tone, hair, or wardrobe`,
        },
      });

      setName('');
      setTamilName('');
      setAppearance('');
      setClothing('');
      setHair('');
      setSkin('');
      setPersonality('');
      setCulturalMarkers('');
      setIsCreating(false);
      showNotification('Locked character created successfully', 'success');
      await loadCharacters();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Failed to create character', 'error');
    }
  };

  const handleToggleLock = async (char: any) => {
    try {
      await api.patch(`/ai/characters/${char.id}`, { is_locked: !char.is_locked });
      await loadCharacters();
      showNotification(
        char.is_locked ? 'Character lock released' : 'Character locked for visual consistency',
        'info'
      );
    } catch {
      showNotification('Failed to toggle lock', 'error');
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    try {
      await api.delete(`/ai/characters/${id}`);
      await loadCharacters();
      showNotification('Character removed', 'info');
    } catch {
      showNotification('Failed to delete character', 'error');
    }
  };

  const handleStartEdit = (char: any) => {
    if (char.is_locked) {
      showNotification(
        `Character "${char.name}" is locked. Click LOCKED to unlock before editing attributes and preserving consistency.`,
        'warning'
      );
      return;
    }
    const meta = char.metadata_info || {};
    setEditForm({
      name: char.name || '',
      tamilName: char.tamil_name || '',
      age: char.age || 25,
      gender: char.gender || 'Male',
      appearance: char.appearance || '',
      clothing: char.clothing || '',
      hair: char.hair || '',
      skin: char.skin || '',
      visualStyle: char.visual_style || 'Cinematic Photorealistic',
      personality: char.personality || '',
      culturalMarkers: meta.cultural_markers || '',
      colorPalette: meta.color_palette || DEFAULT_COLOR_PALETTES[0],
      isLocked: char.is_locked,
    });
    setEditingCharId(char.id);
  };

  const handleSaveEdit = async (charId: string) => {
    if (!editForm.name.trim()) return;
    try {
      await api.patch(`/ai/characters/${charId}`, {
        name: editForm.name.trim(),
        tamil_name: editForm.tamilName.trim() || undefined,
        age: editForm.age,
        gender: editForm.gender,
        appearance: editForm.appearance.trim() || undefined,
        clothing: editForm.clothing.trim() || undefined,
        hair: editForm.hair.trim() || undefined,
        skin: editForm.skin.trim() || undefined,
        visual_style: editForm.visualStyle,
        personality: editForm.personality.trim() || undefined,
        is_locked: editForm.isLocked,
        metadata_info: {
          cultural_markers: editForm.culturalMarkers.trim() || undefined,
          color_palette: editForm.colorPalette,
          negative_prompt: `no alterations to ${editForm.name}'s face, skin tone, hair, or wardrobe`,
        },
      });
      setEditingCharId(null);
      showNotification('Character attributes updated successfully', 'success');
      await loadCharacters();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Failed to update character', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 select-none text-xs" id="character-studio">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-850">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-cinema-ai" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Character Studio &amp; Consistency Lock
          </span>
          <span className="text-[11px] text-cinema-textDim font-mono">({characters.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="add-character-btn"
            data-testid="add-character-btn"
            onClick={() => setIsCreating((prev) => !prev)}
            disabled={!activeProject}
            className="flex items-center gap-1.5 px-3 py-1 bg-cinema-red hover:bg-cinema-redHover text-white text-xs rounded transition-colors disabled:opacity-50 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isCreating ? 'Cancel' : 'Add Character'}</span>
          </button>
        </div>
      </div>

      {/* 12-Attribute Character Creation Panel */}
      {isCreating && (
        <div className="p-4 bg-cinema-850 border-b border-cinema-border space-y-3 overflow-y-auto max-h-[70vh]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <p className="text-xs font-bold text-white uppercase tracking-wide">
                Define 12 Consistency Attributes
              </p>
            </div>
            <button
              type="button"
              onClick={handlePopulatePreset}
              className="text-[10px] text-cinema-ai hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" /> Load Kollywood Hero Preset
            </button>
          </div>

          {/* Row 1: Names */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                1. Character Name (English) *
              </label>
              <input
                type="text"
                placeholder="e.g. Karthik"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai"
              />
            </div>
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                2. Tamil Name (தமிழ் பெயர்)
              </label>
              <input
                type="text"
                placeholder="e.g. கார்த்திக்"
                value={tamilName}
                onChange={(e) => setTamilName(e.target.value)}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai font-serif"
              />
            </div>
          </div>

          {/* Row 2: Age, Gender, Visual Style */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                3. Age
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(parseInt(e.target.value) || 25)}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                4. Gender
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                5. Visual Style Preset
              </label>
              <select
                value={visualStyle}
                onChange={(e) => setVisualStyle(e.target.value)}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai"
              >
                <option value="Cinematic Photorealistic">Cinematic Photorealistic</option>
                <option value="Kollywood Noir High-Contrast">Kollywood Noir High-Contrast</option>
                <option value="Period Historical Epic">Period Historical Epic</option>
                <option value="Contemporary Realistic Drama">Contemporary Realistic Drama</option>
              </select>
            </div>
          </div>

          {/* Row 3: Appearance & Clothing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                6. Face &amp; Physical Appearance
              </label>
              <textarea
                placeholder="Facial structure, jawline, eye shape, physique..."
                value={appearance}
                onChange={(e) => setAppearance(e.target.value)}
                rows={2}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai resize-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                7. Wardrobe &amp; Clothing Styling
              </label>
              <textarea
                placeholder="Specific garments, fabrics, colors, styling..."
                value={clothing}
                onChange={(e) => setClothing(e.target.value)}
                rows={2}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai resize-none"
              />
            </div>
          </div>

          {/* Row 4: Hair, Skin, Cultural Markers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                8. Hair Style &amp; Color
              </label>
              <input
                type="text"
                placeholder="e.g. Textured black wavy hair"
                value={hair}
                onChange={(e) => setHair(e.target.value)}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai"
              />
            </div>
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                9. Skin Complexion
              </label>
              <input
                type="text"
                placeholder="e.g. Warm dusky complexion"
                value={skin}
                onChange={(e) => setSkin(e.target.value)}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai"
              />
            </div>
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                10. Cultural Markers
              </label>
              <input
                type="text"
                placeholder="e.g. Vibhooti mark, sacred thread"
                value={culturalMarkers}
                onChange={(e) => setCulturalMarkers(e.target.value)}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai"
              />
            </div>
          </div>

          {/* Row 5: Personality & Color Palette */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                11. Demeanor &amp; Personality
              </label>
              <input
                type="text"
                placeholder="e.g. Resolute, intense gaze, charismatic"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai"
              />
            </div>
            <div>
              <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                12. Color Palette Chips
              </label>
              <div className="flex items-center gap-2 pt-1">
                {colorPalette.map((col, cIdx) => (
                  <input
                    key={cIdx}
                    type="color"
                    value={col}
                    onChange={(e) => {
                      const updated = [...colorPalette];
                      updated[cIdx] = e.target.value;
                      setColorPalette(updated);
                    }}
                    className="w-8 h-8 rounded border border-cinema-border cursor-pointer bg-transparent"
                    title={col}
                  />
                ))}
                <span className="text-[10px] text-cinema-textDim font-mono">
                  {colorPalette.join(', ')}
                </span>
              </div>
            </div>
          </div>

          {/* Lock Checkbox & Save */}
          <div className="flex items-center justify-between pt-2 border-t border-cinema-border/60">
            <label className="flex items-center gap-2 cursor-pointer text-cinema-textDim text-xs select-none">
              <input
                type="checkbox"
                checked={isLocked}
                onChange={(e) => setIsLocked(e.target.checked)}
                className="rounded accent-emerald-500 w-4 h-4"
              />
              <span className="font-semibold text-white">
                Character Lock (Strict Visual Consistency Across Scenes)
              </span>
            </label>
            <button
              onClick={handleCreateCharacter}
              disabled={!name.trim()}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition-colors disabled:opacity-50"
            >
              Lock &amp; Save Character
            </button>
          </div>
        </div>
      )}

      {/* Character Cards List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!activeProject ? (
          <p className="text-xs text-cinema-textDim text-center mt-8">
            Open a project to manage consistent characters
          </p>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-24 text-cinema-textDim gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading characters...
          </div>
        ) : characters.length === 0 ? (
          <div className="text-center py-12 text-cinema-textDim space-y-3">
            <UserCheck className="w-10 h-10 mx-auto opacity-20 text-cinema-ai" />
            <p className="text-sm font-semibold text-white">No Characters Registered</p>
            <p className="text-xs max-w-sm mx-auto">
              Define characters with 12 locked consistency attributes to maintain exact visual appearance across every scene.
            </p>
            <button
              onClick={() => {
                setIsCreating(true);
                handlePopulatePreset();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-cinema-red hover:bg-cinema-redHover text-white text-xs font-semibold rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Initialize Demo Character
            </button>
          </div>
        ) : (
          characters.map((char) => {
            const isEditing = editingCharId === char.id;
            const meta = char.metadata_info || {};
            const chips = meta.color_palette || DEFAULT_COLOR_PALETTES[0];
            const cultural = meta.cultural_markers;

            if (isEditing) {
              return (
                <div
                  key={char.id}
                  data-testid="character-card-editing"
                  className="p-4 bg-cinema-850 border border-cinema-ai/60 rounded-lg space-y-3 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-cinema-border/60 pb-2">
                    <span className="font-bold text-white text-xs uppercase tracking-wide flex items-center gap-1.5">
                      <Edit2 className="w-3.5 h-3.5 text-cinema-ai" /> Edit Consistency Attributes ({char.name})
                    </span>
                    <button
                      onClick={() => setEditingCharId(null)}
                      className="text-cinema-textDim hover:text-white p-1 rounded hover:bg-cinema-800"
                      title="Cancel Editing"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Row 1: Names */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Name (English)
                      </label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Tamil Name (தமிழ் பெயர்)
                      </label>
                      <input
                        type="text"
                        value={editForm.tamilName}
                        onChange={(e) => setEditForm({ ...editForm, tamilName: e.target.value })}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai font-serif"
                      />
                    </div>
                  </div>

                  {/* Row 2: Age, Gender, Visual Style */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Age
                      </label>
                      <input
                        type="number"
                        value={editForm.age}
                        onChange={(e) => setEditForm({ ...editForm, age: parseInt(e.target.value) || 25 })}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Gender
                      </label>
                      <select
                        value={editForm.gender}
                        onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Non-binary">Non-binary</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Visual Style
                      </label>
                      <select
                        value={editForm.visualStyle}
                        onChange={(e) => setEditForm({ ...editForm, visualStyle: e.target.value })}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai"
                      >
                        <option value="Cinematic Photorealistic">Cinematic Photorealistic</option>
                        <option value="Kollywood Noir High-Contrast">Kollywood Noir High-Contrast</option>
                        <option value="Period Historical Epic">Period Historical Epic</option>
                        <option value="Contemporary Realistic Drama">Contemporary Realistic Drama</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Appearance & Clothing */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Face &amp; Physical Appearance
                      </label>
                      <textarea
                        value={editForm.appearance}
                        onChange={(e) => setEditForm({ ...editForm, appearance: e.target.value })}
                        rows={2}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Wardrobe &amp; Styling
                      </label>
                      <textarea
                        value={editForm.clothing}
                        onChange={(e) => setEditForm({ ...editForm, clothing: e.target.value })}
                        rows={2}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai resize-none"
                      />
                    </div>
                  </div>

                  {/* Row 4: Hair, Skin, Cultural Markers */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Hair
                      </label>
                      <input
                        type="text"
                        value={editForm.hair}
                        onChange={(e) => setEditForm({ ...editForm, hair: e.target.value })}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Skin Complexion
                      </label>
                      <input
                        type="text"
                        value={editForm.skin}
                        onChange={(e) => setEditForm({ ...editForm, skin: e.target.value })}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Cultural Markers
                      </label>
                      <input
                        type="text"
                        value={editForm.culturalMarkers}
                        onChange={(e) => setEditForm({ ...editForm, culturalMarkers: e.target.value })}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai"
                      />
                    </div>
                  </div>

                  {/* Row 5: Personality & Palette */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Personality &amp; Demeanor
                      </label>
                      <input
                        type="text"
                        value={editForm.personality}
                        onChange={(e) => setEditForm({ ...editForm, personality: e.target.value })}
                        className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-xs outline-none focus:border-cinema-ai"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-cinema-textDim uppercase font-semibold mb-1">
                        Color Palette Chips
                      </label>
                      <div className="flex items-center gap-1.5 pt-1">
                        {editForm.colorPalette.map((col, cIdx) => (
                          <input
                            key={cIdx}
                            type="color"
                            value={col}
                            onChange={(e) => {
                              const updated = [...editForm.colorPalette];
                              updated[cIdx] = e.target.value;
                              setEditForm({ ...editForm, colorPalette: updated });
                            }}
                            className="w-7 h-7 rounded border border-cinema-border cursor-pointer bg-transparent"
                            title={col}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-cinema-border/60">
                    <button
                      onClick={() => setEditingCharId(null)}
                      className="px-3 py-1 bg-cinema-800 hover:bg-cinema-750 text-cinema-textDim hover:text-white rounded text-xs transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(char.id)}
                      disabled={!editForm.name.trim()}
                      className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs transition-colors disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Changes
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={char.id}
                data-testid="character-card"
                className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3 hover:border-cinema-ai/40 transition-colors shadow-lg"
              >
                {/* Header: Name, Age, Lock, Actions */}
                <div className="flex items-center justify-between border-b border-cinema-border/60 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">{char.name}</span>
                    {char.tamil_name && (
                      <span className="text-cinema-ai text-xs font-serif font-semibold">
                        ({char.tamil_name})
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-cinema-900 border border-cinema-border text-[10px] text-cinema-textDim font-mono">
                      {char.age || 25}yo • {char.gender || 'unspecified'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-cinema-900 border border-cinema-border text-[10px] text-cinema-textDim font-mono">
                      {char.visual_style || 'Cinematic Photorealistic'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleLock(char)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold border transition-colors ${
                        char.is_locked
                          ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                          : 'bg-amber-950/80 border-amber-600 text-amber-300'
                      }`}
                      title={
                        char.is_locked
                          ? 'Locked: Visual attributes strictly enforced in AI prompts'
                          : 'Unlocked: Variations permitted'
                      }
                    >
                      {char.is_locked ? (
                        <>
                          <Lock className="w-3 h-3 text-emerald-400" />
                          <span>LOCKED</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3 h-3 text-amber-400" />
                          <span>UNLOCKED</span>
                        </>
                      )}
                    </button>
                    <button
                      data-testid="edit-character-btn"
                      onClick={() => handleStartEdit(char)}
                      className={`p-1 rounded transition-colors ${
                        char.is_locked
                          ? 'text-cinema-textDim hover:text-amber-400 hover:bg-cinema-800'
                          : 'text-cinema-ai hover:text-white hover:bg-cinema-800'
                      }`}
                      title={
                        char.is_locked
                          ? 'Character is locked. Unlock before editing attributes.'
                          : 'Edit Consistency Attributes'
                      }
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCharacter(char.id)}
                      className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-cinema-800"
                      title="Delete Character"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Attributes Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-cinema-textDim">
                  <div className="flex items-start gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-cinema-ai flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-cinema-textMuted">Appearance: </span>
                      <span>{char.appearance || 'Standard features'}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5">
                    <Shirt className="w-3.5 h-3.5 text-cinema-ai flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-cinema-textMuted">Wardrobe: </span>
                      <span>{char.clothing || 'Standard wardrobe'}</span>
                    </div>
                  </div>

                  {(char.hair || char.skin) && (
                    <div className="flex items-start gap-1.5">
                      <Scissors className="w-3.5 h-3.5 text-cinema-ai flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-cinema-textMuted">Features: </span>
                        <span>
                          {char.hair ? `${char.hair} hair` : ''}
                          {char.hair && char.skin ? ', ' : ''}
                          {char.skin ? `${char.skin} complexion` : ''}
                        </span>
                      </div>
                    </div>
                  )}

                  {cultural && (
                    <div className="flex items-start gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-emerald-400">Cultural Markers: </span>
                        <span>{cultural}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Color Palette Chips & Prompt Prefix */}
                <div className="pt-2 border-t border-cinema-border/60 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <Palette className="w-3 h-3 text-cinema-textDim" />
                    <span className="text-[10px] text-cinema-textDim font-semibold">Palette:</span>
                    <div className="flex items-center gap-1">
                      {chips.map((c: string, idx: number) => (
                        <div
                          key={idx}
                          className="w-3.5 h-3.5 rounded-full border border-cinema-border shadow"
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Locked Prompt Prefix Snippet */}
                  <div className="text-[9px] font-mono text-cinema-textDim bg-cinema-900 border border-cinema-border/70 rounded px-2 py-0.5 max-w-sm truncate">
                    <span className="text-emerald-400 font-bold">PREFIX:</span> [Character {char.name}
                    {char.tamil_name ? ` (${char.tamil_name})` : ''}, {char.age || 25}yo,{' '}
                    {char.gender || 'Male'}]
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
