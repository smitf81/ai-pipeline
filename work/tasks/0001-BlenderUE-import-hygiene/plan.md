# Task 0001: Blender→UE import hygiene

## Goal
- Improve startup time of the UE editor by reducing unnecessary re-importing of assets from Blender bridge folder
- Ensure each asset is imported only once and marked as processed
- Maintain a clean and organized structure for processed assets

## MVP scope (must-haves)
- Identify all files in the bridge folder upon UE editor startup
- Import each file into UE, marking them as processed after successful import
- Move imported files to a separate 'imported' folder
- Add an option in the editor settings for developers to enable/disable this feature
- Display notifications in the editor for any errors during import or processing
- Implement basic logging and error handling to assist with troubleshooting

## Out of scope (not now)
- Optimizing performance by parallelizing import processes
- Creating an automated UI for users to review/retry failed imports
- Providing a detailed report on the results of the import hygiene process
- Integrating this feature into other platforms or pipelines

## Acceptance criteria
- [ ] The UE editor no longer re-imports assets from the bridge folder at startup
- [ ] Imported assets are moved to an 'imported' folder automatically
- [ ] Assets marked as processed do not trigger importing during future UE editor startups
- [ ] An option is available in the editor settings for enabling/disabling this feature
- [ ] Error messages are displayed when there are problems importing or processing assets
- [ ] Basic logging and error handling are implemented to assist with troubleshooting

## Risks / notes
- Edge case: Handling file changes during UE editor runtime (recommend developer disable import hygiene before making modifications in Blender)
- Assumption: Imported files will not be modified during UE editor runtime
- Gotcha: Files with naming conflicts may require manual intervention
