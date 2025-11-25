# Entity Classification Fix Verification Checklist

Use this checklist to verify all 20 misclassifications have been fixed in the Workbench.

## Test Instructions
1. Reload the Electron Workbench with `02 CZ Ruins Mouths of Madness Reforged.md`
2. Open Content Tree navigator (right sidebar)
3. Check the icons against the expected classifications below
4. Mark each as ✓ verified or ✗ failed

---

## Section 1: Creatures Misclassified as Features → Now 👹 Monster

These should now display with 👹 monster icon:

- [ ] **Animal herd** (line ~466)
- [ ] **Bat, giant cave** (if present)
- [ ] **Rats, River (giant)** (if present)
- [ ] **Snake, poisonous** (if present)
- [ ] **Snake, poisonous (deadly)** (if present)
- [ ] **Wolverine (small, normal)** (if present)
- [ ] **Bat, Cave** (if present)
- [ ] **Rats, Giant** (if present)
- [ ] **Cave bats x 80** (if present)
- [ ] **Giant rats** (if present)
- [ ] **6 gnoll males** (if present)

---

## Section 2: Generic Monsters Previously NPCs → Now 👹 Monster

These should now display with 👹 monster icon (not 🧍):

- [ ] **Bugbear** (if present)
- [ ] **Ghoul** (if present)
- [ ] **Gnoll** (if present)
- [ ] **Griffon** (if present)
- [ ] **Hobgoblin** (if present)
- [ ] **Kobold** (if present)
- [ ] **Lizardfolk** (if present)
- [ ] **Nixies (sprite)** (if present)
- [ ] **Orc** (if present)
- [ ] **Stirges** (if present)
- [ ] **Mastiff** (if present)

---

## Section 3: Named NPCs Previously Features → Now 🧍 NPC

These should now display with 🧍 NPC icon (not ✨):

- [ ] **Ug-Muk'tik** (if present)
- [ ] **Grug-much** (if present)

---

## Section 4: Named NPCs Previously Monsters → Now 🧍 NPC

These should now display with 🧍 NPC icon (not 👹):

- [ ] **Wily Wil, Giant of the Hill** (if present)
- [ ] **Yeexuul (Gnoll Chieftain)** (if present)
- [ ] **Ember Raventree (wood elf leader)** (if present)

---

## Section 5: Named NPCs Previously Hazards → Now 🧍 NPC

These should now display with 🧍 NPC icon (not ⚠️):

- [ ] **Ji'gun-tima (Losel Shaman)** (if present)

---

## Section 6: Locations Previously Monsters → Now ✨ Feature

These should now display with ✨ feature icon (not 👹):

- [ ] **The Green Dragon Inn** (if present)

---

## Summary

**Total Classifications to Verify**: 20 (or fewer if some entities don't exist in this document)

**Verification Date**: _______________
**Verified By**: _______________
**Status**: ☐ All passed  ☐ Some failed  ☐ Not yet tested

**Failed Items** (if any):
- 
- 
- 

---

## Notes for Failed Items

If any classifications still don't match, add debugging notes here:

1. Entity Name: _________________ | Current Icon: ____ | Expected Icon: ____ | Issue: _______________
2. Entity Name: _________________ | Current Icon: ____ | Expected Icon: ____ | Issue: _______________
3. Entity Name: _________________ | Current Icon: ____ | Expected Icon: ____ | Issue: _______________
