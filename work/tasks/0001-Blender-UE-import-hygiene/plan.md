# Task 0001: Blender UE import hygiene

## Goal
- Remove processed blend files from the bridge folder after Unreal imports to prevent reimporting on restart
- Maintain a clean and organized project structure for easier development, debugging, and maintenance

## MVP scope (must-haves)
- **Edit `bridge_watcher.py`:** Modify the script to delete .blend files from the bridge folder after they have been successfully imported into Unreal Engine
- **Update `README.txt`:** Add a note about the file deletion process for better transparency and understanding of the system behavior
- **Add tests in `bridge_watcher.py` (or separate testing script):** Test that processed blend files are being deleted after import, ensuring no file reimport on restart
- **Test edge cases:** Confirm proper deletion with various blend files, including special characters and spaces in filenames
- **Document git commands:** Add a note about using `git reset` or similar to avoid committing unintentionally deleted blend files

## Out of scope (not now)
- Implementing a backup system for deleted blend files
- Automatically archiving imported blend files in another location
- Handling Unreal Engine crashes or unexpected issues during import

## Acceptance criteria
- [ ] Verified that processed blend files are removed from the bridge folder after import
- [ ] Confirmed there is no reimport of deleted blend files on restart
- [ ] Ensured that all test cases pass, including edge cases and various blend file names
- [ ] Observed that `git status` does not show deleted blend files as changes to be committed

## Risks / notes
- There is a risk of losing the original blend file if Unreal Engine crashes during import or if another error occurs. This can be mitigated by adding a backup system in the future.
- Be cautious when deleting processed blend files, as there might be unexpected naming conflicts between new and old files. Implement appropriate checks to avoid data loss.
- Make sure not to accidentally commit deleted blend files to your git repository; use `git reset` or another method to manage unstaged changes.
