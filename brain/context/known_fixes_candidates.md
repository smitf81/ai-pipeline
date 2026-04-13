# Candidate Known Fixes

Review-only proposals promoted from repeated failures. These are not prompt-fed by default.

Version: ace/known-fix-candidates.v1
Updated: 2026-04-13T21:17:31.818Z

### Keep apply and build stages off dirty repositories
- Status: candidate
- Failure key: dirty_repo_blocked
- Pattern: Dirty repo blocked
- Evidence count: 4207
- First seen: 2026-04-13T20:01:18.975Z
- Last seen: 2026-04-13T21:17:31.816Z
- Related tools: node
- Related stages: planner
- Example messages:
  - Repository has uncommitted tracked changes.
M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/safe_mode/boot-recovery-daemon.json
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/history.json
 M data/spatial/qa/investigations.json
 M data/spatial/qa/lead-state.json
 M data/spatial/qa/output-feed.json
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/workspace.json
 M ui/ctoChiefOfStaff.js
 M ui/localModelClient.js
 M ui/public/spatial/spatialApp.js
 M ui/public/style.css
 M ui/server.js
 M ui/tests/ctoChiefOfStaff.test.mjs
 M ui/tests/intentRoute.test.mjs
 M ui/tests/server.test.mjs
  - Repository has uncommitted tracked changes.
A  brain/context/agent_audits/context-manager/context-manager_context_manager_1776084840461_kh71ts.json
A  brain/context/agent_audits/context-manager/context-manager_context_manager_1776084840461_kh71ts.md
M  brain/context/autonomy_fix_tasks.json
M  brain/context/autonomy_fix_tasks.md
MM brain/context/failure_history.json
MM brain/context/failure_history.md
MM brain/context/known_fixes_candidates.json
MM brain/context/known_fixes_candidates.md
M  brain/context/safe_mode/boot-recovery-daemon.json
M  brain/emergence/slices.json
M  brain/emergence/slices.md
A  data/spatial/agent-runs/context-manager/context_manager_1776084840461_kh71ts.json
M  data/spatial/history.json
M  data/spatial/qa/investigations.json
A  data/spatial/qa/lead-runs/qa_lead_1776084801641_vldodt.json
A  data/spatial/qa/lead-runs/qa_lead_1776088593675_yf6vgk.json
A  data/spatial/qa/lead-runs/qa_lead_1776089792179_tucqx6.json
A  data/spatial/qa/lead-runs/qa_lead_1776090902196_ddmfle.json
A  data/spatial/qa/lead-runs/qa_lead_1776090989677_x6yw1k.json
A  data/spatial/qa/lead-runs/qa_lead_1776092100697_znz54p.json
A  data/spatial/qa/lead-runs/qa_lead_1776092189692_lqtt8q.json
A  data/spatial/qa/lead-runs/qa_lead_1776093300701_qstosc.json
A  data/spatial/qa/lead-runs/qa_lead_1776093389693_0lck4m.json
A  data/spatial/qa/lead-runs/qa_lead_1776094500703_pewsmb.json
A  data/spatial/qa/lead-runs/qa_lead_1776094589703_mpsd8m.json
A  data/spatial/qa/lead-runs/qa_lead_1776095700717_hu005f.json
A  data/spatial/qa/lead-runs/qa_lead_1776095789704_hh17sm.json
A  data/spatial/qa/lead-runs/qa_lead_1776096900727_kzvdl1.json
A  data/spatial/qa/lead-runs/qa_lead_1776096989810_2vtprz.json
A  data/spatial/qa/lead-runs/qa_lead_1776098100729_hhggnj.json
A  data/spatial/qa/lead-runs/qa_lead_1776098189817_r3ksxl.json
A  data/spatial/qa/lead-runs/qa_lead_1776099300742_z52q9q.json
A  data/spatial/qa/lead-runs/qa_lead_1776099389819_xfg1r6.json
A  data/spatial/qa/lead-runs/qa_lead_1776100500753_zwjvf0.json
A  data/spatial/qa/lead-runs/qa_lead_1776100589824_19urmn.json
A  data/spatial/qa/lead-runs/qa_lead_1776101700759_xrx6te.json
A  data/spatial/qa/lead-runs/qa_lead_1776101789837_qwn252.json
A  data/spatial/qa/lead-runs/qa_lead_1776102900762_iguf40.json
A  data/spatial/qa/lead-runs/qa_lead_1776102989845_xxgqyf.json
A  data/spatial/qa/lead-runs/qa_lead_1776104100950_auqspx.json
A  data/spatial/qa/lead-runs/qa_lead_1776104189852_cq69cd.json
A  data/spatial/qa/lead-runs/qa_lead_1776105300951_budqei.json
A  data/spatial/qa/lead-runs/qa_lead_1776105389863_4o3e9m.json
A  data/spatial/qa/lead-runs/qa_lead_1776106500965_nc3jgh.json
A  data/spatial/qa/lead-runs/qa_lead_1776106589864_y6dbnp.json
A  data/spatial/qa/lead-runs/qa_lead_1776107700966_lqikzz.json
A  data/spatial/qa/lead-runs/qa_lead_1776107789866_c5ogkr.json
A  data/spatial/qa/lead-runs/qa_lead_1776108900973_2cif1g.json
A  data/spatial/qa/lead-runs/qa_lead_1776108989874_4x6t0z.json
A  data/spatial/qa/lead-runs/qa_lead_1776110100982_895oen.json
A  data/spatial/qa/lead-runs/qa_lead_1776110189879_mijs2q.json
A  data/spatial/qa/lead-runs/qa_lead_1776111300984_v3m85n.json
A  data/spatial/qa/lead-runs/qa_lead_1776111389879_rc0xht.json
A  data/spatial/qa/lead-runs/qa_lead_1776112500989_ctab4y.json
A  data/spatial/qa/lead-runs/qa_lead_1776112589879_qc75ju.json
A  data/spatial/qa/lead-runs/qa_lead_1776113700990_0r1nbx.json
A  data/spatial/qa/lead-runs/qa_lead_1776113789882_utsovh.json
A  data/spatial/qa/lead-runs/qa_lead_1776114900999_nwc530.json
M  data/spatial/qa/lead-state.json
M  data/spatial/qa/output-feed.json
M  data/spatial/qa/planner-qa-queue.json
M  data/spatial/qa/planner-qa-queue.md
A  data/spatial/qa/qa_1776083817046_zfhbj8.json
A  data/spatial/qa/qa_1776083946608_0fh1hc.json
A  data/spatial/qa/qa_1776084562116_3q5xha.json
A  data/spatial/qa/qa_1776084774843_1swmc5.json
A  data/spatial/qa/qa_1776084801652_3c1bdc.json
A  data/spatial/qa/qa_1776088593686_wskp4n.json
A  data/spatial/qa/qa_1776088593686_wskp4n/01-initial.png
A  data/spatial/qa/qa_1776088593686_wskp4n/02-studio-smoke.png
A  data/spatial/qa/qa_1776088593686_wskp4n/console.json
A  data/spatial/qa/qa_1776088593686_wskp4n/dom.html
A  data/spatial/qa/qa_1776088593686_wskp4n/layout-findings.json
A  data/spatial/qa/qa_1776088593686_wskp4n/network.json
A  data/spatial/qa/qa_1776088593686_wskp4n/runtime.json
A  data/spatial/qa/qa_1776089792193_ir59z4.json
A  data/spatial/qa/qa_1776090902210_mssdsf.json
A  data/spatial/qa/qa_1776090989697_odb1ny.json
A  data/spatial/qa/qa_1776092100729_al2nc8.json
A  data/spatial/qa/qa_1776092189721_u532ed.json
A  data/spatial/qa/qa_1776093300728_x4febr.json
A  data/spatial/qa/qa_1776093389718_05sesc.json
A  data/spatial/qa/qa_1776094500727_3lrmch.json
A  data/spatial/qa/qa_1776094589728_h7o2p7.json
A  data/spatial/qa/qa_1776095700740_gk5vru.json
A  data/spatial/qa/qa_1776095789731_5kk3yj.json
A  data/spatial/qa/qa_1776096900754_xjys0w.json
A  data/spatial/qa/qa_1776096989834_ehexp3.json
A  data/spatial/qa/qa_1776098100755_psbt88.json
A  data/spatial/qa/qa_1776098189845_v1iohu.json
A  data/spatial/qa/qa_1776099300771_iehmnf.json
A  data/spatial/qa/qa_1776099389846_1kpb2c.json
A  data/spatial/qa/qa_1776100500782_iu6qh8.json
A  data/spatial/qa/qa_1776100589853_3e9tmp.json
A  data/spatial/qa/qa_1776101700787_8mphjl.json
A  data/spatial/qa/qa_1776101789867_fkcz58.json
A  data/spatial/qa/qa_1776102900781_27uizp.json
A  data/spatial/qa/qa_1776102989874_s0f3vz.json
A  data/spatial/qa/qa_1776104100977_4h0bae.json
A  data/spatial/qa/qa_1776104189876_5qyrkj.json
A  data/spatial/qa/qa_1776105300986_6eue75.json
A  data/spatial/qa/qa_1776105389886_128lek.json
A  data/spatial/qa/qa_1776106500992_06818s.json
A  data/spatial/qa/qa_1776106589889_wojlfq.json
A  data/spatial/qa/qa_1776107700998_9quejc.json
A  data/spatial/qa/qa_1776107789895_864xm0.json
A  data/spatial/qa/qa_1776108900999_jfkk9t.json
A  data/spatial/qa/qa_1776108989903_h6clcz.json
A  data/spatial/qa/qa_1776110101008_jhwjcw.json
A  data/spatial/qa/qa_1776110189912_hhfdjk.json
A  data/spatial/qa/qa_1776111301009_u0685s.json
A  data/spatial/qa/qa_1776111389908_st0yr3.json
A  data/spatial/qa/qa_1776112501018_9lynxv.json
A  data/spatial/qa/qa_1776112589905_gonuqv.json
A  data/spatial/qa/qa_1776113701017_xoao2n.json
A  data/spatial/qa/qa_1776113789910_sj7dv0.json
A  data/spatial/qa/qa_1776114901025_rzois2.json
A  data/spatial/qa/qa_1776114989901_ezxcr7.json
M  data/spatial/qa/repair-events.json
M  data/spatial/qa/repair-jobs.json
MM data/spatial/workspace.json
M  ui/ctoChiefOfStaff.js
M  ui/localModelClient.js
M  ui/public/spatial/spatialApp.js
M  ui/public/style.css
M  ui/server.js
M  ui/tests/ctoChiefOfStaff.test.mjs
M  ui/tests/intentRoute.test.mjs
M  ui/tests/server.test.mjs
  - Repository has uncommitted tracked changes.
  - Repository has uncommitted tracked changes.
fatal: mmap failed: Invalid argument
- When:
  - Tracked edits already exist before apply starts.
  - The repo cleanliness check blocks the operation.
- Do:
  - Clean or isolate the worktree before rebuilding.
  - Preserve the current task artifacts and stop early.
- Avoid:
  - Applying a new patch on top of unreviewed tracked edits.
- Tags: git, repository, safety
- Source: failure-history
