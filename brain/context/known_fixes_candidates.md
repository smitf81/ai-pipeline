# Candidate Known Fixes

Review-only proposals promoted from repeated failures. These are not prompt-fed by default.

Version: ace/known-fix-candidates.v1
Updated: 2026-04-11T08:17:44.164Z

### Keep apply and build stages off dirty repositories
- Status: candidate
- Failure key: dirty_repo_blocked
- Pattern: Dirty repo blocked
- Evidence count: 20186
- First seen: 2026-04-09T18:59:24.976Z
- Last seen: 2026-04-11T08:17:44.161Z
- Related tools: node, autonomy-policy, git
- Related stages: planner, builder-preflight
- Example messages:
  - Repository has uncommitted tracked changes.
M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
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
 M ui/failureMemory.js
  - Repository has uncommitted tracked changes.
M  brain/context/autonomy_fix_tasks.json
M  brain/context/autonomy_fix_tasks.md
MM brain/context/failure_history.json
MM brain/context/failure_history.md
MM brain/context/known_fixes_candidates.json
MM brain/context/known_fixes_candidates.md
M  brain/emergence/slices.json
M  brain/emergence/slices.md
M  data/spatial/history.json
M  data/spatial/qa/investigations.json
A  data/spatial/qa/lead-runs/qa_lead_1775833543675_zvh8n1.json
A  data/spatial/qa/lead-runs/qa_lead_1775834743688_3z94es.json
A  data/spatial/qa/lead-runs/qa_lead_1775835943694_gtbjul.json
A  data/spatial/qa/lead-runs/qa_lead_1775837143698_spceao.json
A  data/spatial/qa/lead-runs/qa_lead_1775838343705_pnj1hq.json
A  data/spatial/qa/lead-runs/qa_lead_1775839543716_nqar9j.json
A  data/spatial/qa/lead-runs/qa_lead_1775840743726_g71784.json
A  data/spatial/qa/lead-runs/qa_lead_1775841943736_b2vr3t.json
A  data/spatial/qa/lead-runs/qa_lead_1775843143745_tbchqr.json
A  data/spatial/qa/lead-runs/qa_lead_1775844343747_fmsd5f.json
A  data/spatial/qa/lead-runs/qa_lead_1775845543754_vgxten.json
A  data/spatial/qa/lead-runs/qa_lead_1775846743757_uu27nv.json
A  data/spatial/qa/lead-runs/qa_lead_1775847943769_t5f9le.json
A  data/spatial/qa/lead-runs/qa_lead_1775849143783_bpgqey.json
A  data/spatial/qa/lead-runs/qa_lead_1775850343784_rw60n1.json
A  data/spatial/qa/lead-runs/qa_lead_1775851543798_s0g48i.json
A  data/spatial/qa/lead-runs/qa_lead_1775852743802_rp3nzg.json
A  data/spatial/qa/lead-runs/qa_lead_1775853943807_ssdpqj.json
A  data/spatial/qa/lead-runs/qa_lead_1775855143811_bcyznd.json
A  data/spatial/qa/lead-runs/qa_lead_1775856343812_fop7ew.json
A  data/spatial/qa/lead-runs/qa_lead_1775857543826_81mdap.json
A  data/spatial/qa/lead-runs/qa_lead_1775858743841_4ljui2.json
A  data/spatial/qa/lead-runs/qa_lead_1775889051395_uw1afb.json
A  data/spatial/qa/lead-runs/qa_lead_1775890259479_ql3f71.json
A  data/spatial/qa/lead-runs/qa_lead_1775891459480_chmowh.json
A  data/spatial/qa/lead-runs/qa_lead_1775892660535_58dgq0.json
A  data/spatial/qa/lead-runs/qa_lead_1775893862114_omfgba.json
A  data/spatial/qa/lead-runs/qa_lead_1775895066752_86s4ht.json
A  data/spatial/qa/lead-runs/qa_lead_1775895333908_h1zgpn.json
M  data/spatial/qa/lead-state.json
M  data/spatial/qa/output-feed.json
MM data/spatial/qa/planner-qa-queue.json
MM data/spatial/qa/planner-qa-queue.md
A  data/spatial/qa/qa_1775833543704_3i826o.json
A  data/spatial/qa/qa_1775834743719_pai9n0.json
A  data/spatial/qa/qa_1775834743719_pai9n0/01-initial.png
A  data/spatial/qa/qa_1775835943725_dckd11.json
A  data/spatial/qa/qa_1775837143727_l55eay.json
A  data/spatial/qa/qa_1775838343735_24xt6g.json
A  data/spatial/qa/qa_1775839543746_8bs7kn.json
A  data/spatial/qa/qa_1775840743756_35s5nl.json
A  data/spatial/qa/qa_1775841943771_o48omv.json
A  data/spatial/qa/qa_1775843143778_wjm7m5.json
A  data/spatial/qa/qa_1775844343773_afmrof.json
A  data/spatial/qa/qa_1775845543786_306dn3.json
A  data/spatial/qa/qa_1775846743789_za1y7n.json
A  data/spatial/qa/qa_1775847943801_5bzuge.json
A  data/spatial/qa/qa_1775849144103_dm5vzf.json
A  data/spatial/qa/qa_1775850343811_d9yins.json
A  data/spatial/qa/qa_1775851543829_zxmbtx.json
A  data/spatial/qa/qa_1775852743830_q1se6u.json
A  data/spatial/qa/qa_1775853943835_vzljl6.json
A  data/spatial/qa/qa_1775855143843_tjz9zb.json
A  data/spatial/qa/qa_1775856343844_zhrm00.json
A  data/spatial/qa/qa_1775856343844_zhrm00/01-initial.png
A  data/spatial/qa/qa_1775857543858_7ip0ij.json
A  data/spatial/qa/qa_1775857543858_7ip0ij/01-initial.png
A  data/spatial/qa/qa_1775858743870_x3o0w8.json
A  data/spatial/qa/qa_1775889051418_cpu4ny.json
A  data/spatial/qa/qa_1775890259794_cr7b0w.json
A  data/spatial/qa/qa_1775891459494_0tvtlx.json
A  data/spatial/qa/qa_1775891459494_0tvtlx/01-initial.png
A  data/spatial/qa/qa_1775891459494_0tvtlx/02-studio-smoke.png
A  data/spatial/qa/qa_1775891459494_0tvtlx/console.json
A  data/spatial/qa/qa_1775891459494_0tvtlx/dom.html
A  data/spatial/qa/qa_1775891459494_0tvtlx/layout-findings.json
A  data/spatial/qa/qa_1775891459494_0tvtlx/network.json
A  data/spatial/qa/qa_1775891459494_0tvtlx/runtime.json
A  data/spatial/qa/qa_1775892660584_og4gso.json
A  data/spatial/qa/qa_1775893873185_cycfmp.json
A  data/spatial/qa/qa_1775895070738_fp520z.json
A  data/spatial/qa/qa_1775895333918_ozcrjo.json
MM data/spatial/qa/repair-events.json
MM data/spatial/qa/repair-jobs.json
MM data/spatial/workspace.json
M  ui/ctoChiefOfStaff.js
M  ui/failureMemory.js
  - Repository has uncommitted tracked changes.
M  brain/context/autonomy_fix_tasks.json
M  brain/context/autonomy_fix_tasks.md
M  brain/context/failure_history.json
M  brain/context/failure_history.md
M  brain/context/known_fixes_candidates.json
M  brain/context/known_fixes_candidates.md
M  brain/emergence/slices.json
M  brain/emergence/slices.md
M  data/spatial/history.json
M  data/spatial/qa/investigations.json
A  data/spatial/qa/lead-runs/qa_lead_1775833543675_zvh8n1.json
A  data/spatial/qa/lead-runs/qa_lead_1775834743688_3z94es.json
A  data/spatial/qa/lead-runs/qa_lead_1775835943694_gtbjul.json
A  data/spatial/qa/lead-runs/qa_lead_1775837143698_spceao.json
A  data/spatial/qa/lead-runs/qa_lead_1775838343705_pnj1hq.json
A  data/spatial/qa/lead-runs/qa_lead_1775839543716_nqar9j.json
A  data/spatial/qa/lead-runs/qa_lead_1775840743726_g71784.json
A  data/spatial/qa/lead-runs/qa_lead_1775841943736_b2vr3t.json
A  data/spatial/qa/lead-runs/qa_lead_1775843143745_tbchqr.json
A  data/spatial/qa/lead-runs/qa_lead_1775844343747_fmsd5f.json
A  data/spatial/qa/lead-runs/qa_lead_1775845543754_vgxten.json
A  data/spatial/qa/lead-runs/qa_lead_1775846743757_uu27nv.json
A  data/spatial/qa/lead-runs/qa_lead_1775847943769_t5f9le.json
A  data/spatial/qa/lead-runs/qa_lead_1775849143783_bpgqey.json
A  data/spatial/qa/lead-runs/qa_lead_1775850343784_rw60n1.json
A  data/spatial/qa/lead-runs/qa_lead_1775851543798_s0g48i.json
A  data/spatial/qa/lead-runs/qa_lead_1775852743802_rp3nzg.json
A  data/spatial/qa/lead-runs/qa_lead_1775853943807_ssdpqj.json
A  data/spatial/qa/lead-runs/qa_lead_1775855143811_bcyznd.json
A  data/spatial/qa/lead-runs/qa_lead_1775856343812_fop7ew.json
A  data/spatial/qa/lead-runs/qa_lead_1775857543826_81mdap.json
A  data/spatial/qa/lead-runs/qa_lead_1775858743841_4ljui2.json
A  data/spatial/qa/lead-runs/qa_lead_1775889051395_uw1afb.json
A  data/spatial/qa/lead-runs/qa_lead_1775890259479_ql3f71.json
A  data/spatial/qa/lead-runs/qa_lead_1775891459480_chmowh.json
A  data/spatial/qa/lead-runs/qa_lead_1775892660535_58dgq0.json
A  data/spatial/qa/lead-runs/qa_lead_1775893862114_omfgba.json
A  data/spatial/qa/lead-runs/qa_lead_1775895066752_86s4ht.json
A  data/spatial/qa/lead-runs/qa_lead_1775895333908_h1zgpn.json
M  data/spatial/qa/lead-state.json
M  data/spatial/qa/output-feed.json
M  data/spatial/qa/planner-qa-queue.json
M  data/spatial/qa/planner-qa-queue.md
A  data/spatial/qa/qa_1775833543704_3i826o.json
A  data/spatial/qa/qa_1775834743719_pai9n0.json
A  data/spatial/qa/qa_1775834743719_pai9n0/01-initial.png
A  data/spatial/qa/qa_1775835943725_dckd11.json
A  data/spatial/qa/qa_1775837143727_l55eay.json
A  data/spatial/qa/qa_1775838343735_24xt6g.json
A  data/spatial/qa/qa_1775839543746_8bs7kn.json
A  data/spatial/qa/qa_1775840743756_35s5nl.json
A  data/spatial/qa/qa_1775841943771_o48omv.json
A  data/spatial/qa/qa_1775843143778_wjm7m5.json
A  data/spatial/qa/qa_1775844343773_afmrof.json
A  data/spatial/qa/qa_1775845543786_306dn3.json
A  data/spatial/qa/qa_1775846743789_za1y7n.json
A  data/spatial/qa/qa_1775847943801_5bzuge.json
A  data/spatial/qa/qa_1775849144103_dm5vzf.json
A  data/spatial/qa/qa_1775850343811_d9yins.json
A  data/spatial/qa/qa_1775851543829_zxmbtx.json
A  data/spatial/qa/qa_1775852743830_q1se6u.json
A  data/spatial/qa/qa_1775853943835_vzljl6.json
A  data/spatial/qa/qa_1775855143843_tjz9zb.json
A  data/spatial/qa/qa_1775856343844_zhrm00.json
A  data/spatial/qa/qa_1775856343844_zhrm00/01-initial.png
A  data/spatial/qa/qa_1775857543858_7ip0ij.json
A  data/spatial/qa/qa_1775857543858_7ip0ij/01-initial.png
A  data/spatial/qa/qa_1775858743870_x3o0w8.json
A  data/spatial/qa/qa_1775889051418_cpu4ny.json
A  data/spatial/qa/qa_1775890259794_cr7b0w.json
A  data/spatial/qa/qa_1775891459494_0tvtlx.json
A  data/spatial/qa/qa_1775891459494_0tvtlx/01-initial.png
A  data/spatial/qa/qa_1775891459494_0tvtlx/02-studio-smoke.png
A  data/spatial/qa/qa_1775891459494_0tvtlx/console.json
A  data/spatial/qa/qa_1775891459494_0tvtlx/dom.html
A  data/spatial/qa/qa_1775891459494_0tvtlx/layout-findings.json
A  data/spatial/qa/qa_1775891459494_0tvtlx/network.json
A  data/spatial/qa/qa_1775891459494_0tvtlx/runtime.json
A  data/spatial/qa/qa_1775892660584_og4gso.json
A  data/spatial/qa/qa_1775893873185_cycfmp.json
A  data/spatial/qa/qa_1775895070738_fp520z.json
A  data/spatial/qa/qa_1775895333918_ozcrjo.json
M  data/spatial/qa/repair-events.json
M  data/spatial/qa/repair-jobs.json
MM data/spatial/workspace.json
M  ui/ctoChiefOfStaff.js
M  ui/failureMemory.js
  - Repository has uncommitted tracked changes.
M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
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
 M ui/failureMemory.js
 M ui/public/index.html
  - blocked | Repository has uncommitted tracked changes.
M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
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
 M ui/failureMemory.js
 M ui/public/index.html
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
