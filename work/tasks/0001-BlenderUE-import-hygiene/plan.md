**Task 0001: Blender→UE import hygiene**

**Goal**



Prevent Unreal Engine from re-importing previously processed bridge assets on editor startup



Ensure the existing Blender→UE bridge behaves idempotently across sessions



Preserve current watcher behaviour and material workflow



**MVP scope (must-haves)**



Add persistent import tracking to ue\_python/bridge\_watcher.py



Store imported file fingerprints on disk (e.g. JSON manifest)



Load this state when the watcher starts



Define a clear “processed” rule, e.g.:



filename + size + modified time



Skip import if a file is already marked as processed



Update \_state\["imported"] to be initialised from disk



Ensure behaviour is unchanged for new files



Add/update tests covering persistence behaviour



Out of scope (not now)



Blender add-on UI changes



New export formats or settings



Material workflow expansion



Asset re-import versioning or overrides



Automatic cleanup/moving of files



**Acceptance criteria**



&nbsp;Restarting Unreal does not re-import existing bridge assets



&nbsp;New FBX files dropped into UE\_Bridge are still imported normally



&nbsp;Persistent state file is created and updated correctly



&nbsp;Deleting the state file causes a full re-import (expected behaviour)



&nbsp;Existing tests still pass



&nbsp;New test added for persistence logic



**Risks / notes**



File fingerprint choice must be robust enough to detect real changes



Corrupted or manually edited state file should fail safely



Must not rely on Unreal-only APIs for persistence (tests run without UE)

