Task 0001: Blender→UE import hygiene
=================================

## Goal
1. Reduce redundant file imports in the Unreal Engine (UE) editor startup.
2. Improve overall performance and workflow efficiency for users of the bridge tool.
3. Maintain a clean project structure with minimal manual intervention required to manage imported files.

## MVP scope (must-haves)
1. Implement file processing status tracking in `bridge_watcher.py` by adding a new 'processed' attribute to the JSON manifest.
2. Modify `bridge_watcher.py` to check for the 'processed' flag on all files before triggering an import.
3. Add a new function to `bridge_watcher.py` that moves processed assets from the bridge folder to a separate 'imported' directory within the project structure.
4. Update the Blender add-on (`blender_addon_send_to_unreal.py`) to remove any duplicate logic for tracking processed files, and instead rely on the status tracker in `bridge_watcher.py`.
5. Create a new utility function in either `agent_mode.py` or `bridge_watcher.py` to automatically flag all existing assets in the bridge folder as 'processed'.
6. Add a visual indicator for processed assets (e.g., a timestamp, checkmark, or other marker) within the Blender add-on UI for users to identify which files have been successfully imported into UE.
7. Test and validate that the new 'processed' flag is being correctly read/written by both the Blender add-on and `bridge_watcher.py`.
8. Document any changes made to the project, along with instructions on how to use the new 'processed' status feature within the existing README files.

## Out of scope (not now)
1. Implementing a complex user interface for managing processed assets directly in Blender or UE.
2. Adding version control or rollback functionality for imported files.
3. Expanding support for file formats beyond FBX and GLTF for the time being.
4. Integrating this change into other 3D modeling applications apart from Blender.
5. Performing extensive performance testing to identify edge cases and further optimization opportunities.

## Acceptance criteria
1. All imported assets are flagged as 'processed' upon successful import in UE.
2. No redundant imports occur during UE editor restarts or bridge folder modifications.
3. Existing processed files can be identified within the Blender add-on UI.
4. The project continues to function without issues after applying these changes.
5. Documentation is updated and reflects the new functionality for users of the bridge tool.
6. No regressions in existing functionality are introduced due to this change.
7. Unit tests for any newly added/modified functions pass successfully.
8. A visual test confirms that no duplicate assets appear in the UE editor after processing them through the bridge tool.

## Risks / notes
- Edge cases may exist where improper file handling or race conditions result in redundant imports.
- The success of this change relies on consistent communication between the Blender add-on and `bridge_watcher.py`.
- Assumes that users will understand the new UI indicator for processed assets and avoid manually re-importing already imported files.
- Further optimization may be required based on performance testing or user feedback.
