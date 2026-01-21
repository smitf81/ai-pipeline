****Task 0001: Blender→UE import hygiene****
===========================================

Goal
----

* Ensure reliable import of .blend files into Unreal Engine (UE) with correct materials and hierarchy
* Minimize manual steps for UE artists
* Automate cleanup/reorganization of .blend file structure

MVP scope (must-haves)
----------------------

* Add a button to Blender's UI for exporting the current scene as an optimized .fbx file
	+ Remove unnecessary data, e.g., armatures and shape keys
	+ Organize collection hierarchy into simple parent/child relationships
* Implement an import script in UE for:
	1. Creating a new folder under Content Browser for the imported model
	2. Importing .fbx with preferred settings (static mesh, combine meshes, generate collision)
	3. Applying textures and materials based on filenames
	4. Spawning an instance of the imported asset in the current level at a default position (0, 0, 0)

Out of scope (not now)
---------------------

* Adding undo/redo functionality for exporting or importing files
* Advanced texture workflow, e.g., automatically creating Material Instances
* Exporting complex scene hierarchies with multiple top-level objects
* Implementing animation support during import

Acceptance criteria
-------------------

* [ ] Button exists in Blender for exporting .fbx files
* [ ] Import script creates a new folder under Content Browser for imported models
* [ ] UE artists do not need to manually adjust import settings
* [ ] Textures and materials are applied automatically during the import process
* [ ] An instance of the imported asset is spawned at (0, 0, 0) in the current level

Risks / notes
-------------

* Compatibility issues between Blender and UE versions
* Differences in naming conventions for textures/materials
* Manually maintaining the mapping of texture names to material properties
