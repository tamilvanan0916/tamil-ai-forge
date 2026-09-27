from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/sfx", tags=["sfx"])

class SFXItemSchema(BaseModel):
    id: str
    category: str
    name: str
    duration_ms: int
    tags: List[str]

SFX_CATEGORIES = [
    "Whoosh", "Impact", "Hit", "Explosion", "Footsteps", "Door",
    "Vehicle", "Nature", "Rain", "Wind", "Water", "Crowd",
    "UI", "Cinematic", "Horror", "Comedy", "Foley"
]

SFX_ITEMS: List[SFXItemSchema] = [
    SFXItemSchema(id="sfx-w1", category="Whoosh", name="Cinematic Fast Whoosh Transition", duration_ms=1200, tags=["transition", "fast", "air"]),
    SFXItemSchema(id="sfx-w2", category="Whoosh", name="Deep Sub Whoosh Rise", duration_ms=2200, tags=["bass", "sub", "riser"]),
    SFXItemSchema(id="sfx-w3", category="Whoosh", name="Whip Swish Fast Pass", duration_ms=850, tags=["whip", "passby"]),
    SFXItemSchema(id="sfx-i1", category="Impact", name="Cinematic Trailer Sub Hit", duration_ms=2500, tags=["trailer", "sub", "boom"]),
    SFXItemSchema(id="sfx-i2", category="Impact", name="Metal Door Slam Impact", duration_ms=1800, tags=["metal", "slam"]),
    SFXItemSchema(id="sfx-i3", category="Impact", name="Mass Hero Punch Impact (Tamil Style)", duration_ms=1400, tags=["punch", "fight", "action"]),
    SFXItemSchema(id="sfx-h1", category="Hit", name="Martial Arts Body Hit", duration_ms=600, tags=["action", "punch", "combat"]),
    SFXItemSchema(id="sfx-h2", category="Hit", name="Sword Clash & Spark Ring", duration_ms=1100, tags=["sword", "metal", "historic"]),
    SFXItemSchema(id="sfx-h3", category="Hit", name="Wood Stick Crack Strike", duration_ms=700, tags=["wood", "stick", "fight"]),
    SFXItemSchema(id="sfx-e1", category="Explosion", name="Huge Petrol Bomb Fire Blast", duration_ms=3800, tags=["fire", "blast", "action"]),
    SFXItemSchema(id="sfx-e2", category="Explosion", name="Distant Grenade Echo", duration_ms=2900, tags=["military", "grenade"]),
    SFXItemSchema(id="sfx-e3", category="Explosion", name="Debris & Rubble Crumble", duration_ms=2400, tags=["debris", "dust"]),
    SFXItemSchema(id="sfx-f1", category="Footsteps", name="Fast Running on Concrete", duration_ms=3200, tags=["run", "chase", "urban"]),
    SFXItemSchema(id="sfx-f2", category="Footsteps", name="Slow Creepy Wood Floor Steps", duration_ms=4100, tags=["wood", "slow", "creepy"]),
    SFXItemSchema(id="sfx-f3", category="Footsteps", name="Mud & Water Puddle Splash Steps", duration_ms=2800, tags=["mud", "rain", "wet"]),
    SFXItemSchema(id="sfx-d1", category="Door", name="Creaky Old Temple Wooden Door", duration_ms=2600, tags=["creak", "temple", "wood"]),
    SFXItemSchema(id="sfx-d2", category="Door", name="Heavy Jail Gate Lock & Shut", duration_ms=2100, tags=["metal", "jail", "latch"]),
    SFXItemSchema(id="sfx-v1", category="Vehicle", name="Royal Enfield Bullet 350 Thump Idling", duration_ms=4500, tags=["bike", "bullet", "engine"]),
    SFXItemSchema(id="sfx-v2", category="Vehicle", name="Madurai Auto Rickshaw Acceleration", duration_ms=3600, tags=["auto", "rickshaw", "city"]),
    SFXItemSchema(id="sfx-v3", category="Vehicle", name="High Speed Car Tyre Screech", duration_ms=2000, tags=["car", "skid", "chase"]),
    SFXItemSchema(id="sfx-n1", category="Nature", name="Western Ghats Morning Jungle Birds", duration_ms=6000, tags=["birds", "jungle", "morning"]),
    SFXItemSchema(id="sfx-n2", category="Nature", name="Night Crickets & Cicadas in Village", duration_ms=5500, tags=["night", "crickets", "village"]),
    SFXItemSchema(id="sfx-r1", category="Rain", name="Heavy Monsoon Downpour on Tin Roof", duration_ms=5200, tags=["monsoon", "roof", "heavy"]),
    SFXItemSchema(id="sfx-r2", category="Rain", name="Drizzle with Distant Thunder Rumbles", duration_ms=4800, tags=["thunder", "drizzle"]),
    SFXItemSchema(id="sfx-wnd1", category="Wind", name="Howling Cold Mountain Gale", duration_ms=4500, tags=["howl", "mountain", "cold"]),
    SFXItemSchema(id="sfx-wnd2", category="Wind", name="Gentle Coconut Tree Sea Breeze", duration_ms=5000, tags=["coastal", "breeze", "palm"]),
    SFXItemSchema(id="sfx-wtr1", category="Water", name="Marina Beach Ocean Waves Shore Break", duration_ms=5500, tags=["beach", "waves", "ocean"]),
    SFXItemSchema(id="sfx-wtr2", category="Water", name="River Stream Gentle Flow & Gurgle", duration_ms=4200, tags=["river", "stream"]),
    SFXItemSchema(id="sfx-c1", category="Crowd", name="Cinema Hall FDFS Cheers & Whistles", duration_ms=4200, tags=["theatre", "whistle", "fdfs", "mass"]),
    SFXItemSchema(id="sfx-c2", category="Crowd", name="Busy Chennai T. Nagar Market Ambience", duration_ms=5000, tags=["market", "bazaar", "street"]),
    SFXItemSchema(id="sfx-u1", category="UI", name="Modern Camera Shutter Click", duration_ms=400, tags=["camera", "click", "snap"]),
    SFXItemSchema(id="sfx-u2", category="UI", name="High-Tech Digital Beep Confirm", duration_ms=500, tags=["digital", "beep", "sci-fi"]),
    SFXItemSchema(id="sfx-cin1", category="Cinematic", name="Deep Sub Bass Drone Tension", duration_ms=4800, tags=["drone", "tension", "bass"]),
    SFXItemSchema(id="sfx-cin2", category="Cinematic", name="Suspense Bowed Cymbal Shimmer", duration_ms=3200, tags=["bowed", "cymbal", "mystery"]),
    SFXItemSchema(id="sfx-hor1", category="Horror", name="Ghostly Whisper in Empty Hallway", duration_ms=2700, tags=["whisper", "ghost", "spooky"]),
    SFXItemSchema(id="sfx-hor2", category="Horror", name="Sudden Jumpscare Screech Stinger", duration_ms=1200, tags=["jumpscare", "stinger", "shriek"]),
    SFXItemSchema(id="sfx-com1", category="Comedy", name="Goundamani / Vadivelu Boing Spring", duration_ms=900, tags=["boing", "spring", "fun"]),
    SFXItemSchema(id="sfx-com2", category="Comedy", name="Funny Slip & Banana Peel Slide", duration_ms=800, tags=["slip", "whistle", "slide"]),
    SFXItemSchema(id="sfx-fol1", category="Foley", name="Leather Jacket Rustle & Movement", duration_ms=1400, tags=["cloth", "leather", "movement"]),
    SFXItemSchema(id="sfx-fol2", category="Foley", name="Porcelain Coffee Cup Clink on Saucer", duration_ms=600, tags=["cup", "ceramic", "kitchen"]),
]

@router.get("/categories", response_model=List[str])
async def list_sfx_categories():
    return SFX_CATEGORIES

@router.get("/items", response_model=List[SFXItemSchema])
async def list_sfx_items(category: Optional[str] = None, q: Optional[str] = None):
    results = SFX_ITEMS
    if category and category != "All":
        results = [item for item in results if item.category.lower() == category.lower()]
    if q and q.strip():
        term = q.strip().lower()
        results = [
            item for item in results
            if term in item.name.lower() or term in item.category.lower() or any(term in t.lower() for t in item.tags)
        ]
    return results

@router.get("/items/{item_id}", response_model=SFXItemSchema)
async def get_sfx_item(item_id: str):
    for item in SFX_ITEMS:
        if item.id == item_id:
            return item
    raise HTTPException(status_code=404, detail="SFX item not found")