async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.json();
}

async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.text();
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? "";
}

function renderList(id, items) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = "";

    if (!items || items.length === 0) {
        const li = document.createElement("li");
        li.className = "muted";
        li.textContent = "None";
        el.appendChild(li);
        return;
    }

    for (const item of items) {
        const li = document.createElement("li");
        li.textContent = item;
        el.appendChild(li);
    }
}

async function boot() {
    try {
        // These endpoints should exist in your server.js already:
        // /api/state, /api/decisions, /api/tasks
        const state = await fetchJSON("/api/state");
        setText("current_focus", state.current_focus || "�");
        setText("active_milestone", state.active_milestone || "�");
        setText("last_updated", state.last_updated || "�");

        renderList("next_actions", state.next_actions);
        renderList("blockers", state.blockers);

        const decisions = await fetchText("/api/decisions");
        const tasks = await fetchText("/api/tasks");

        setText("decisions_text", decisions.trim() || "No decisions yet.");
        setText("tasks_text", tasks.trim() || "No tasks yet.");

        setText("status_badge", "LIVE");
        document.getElementById("status_badge").classList.add("ok");
    } catch (err) {
        console.error(err);
        setText("status_badge", "ERROR");
        document.getElementById("status_badge").classList.add("bad");
        setText("error_box", String(err));
        document.getElementById("error_wrap").style.display = "block";
    }
}

document.addEventListener("DOMContentLoaded", () => { boot(); loadProjects(); });

async function loadProjects() {
    try {
        const res = await fetch("/api/projects");
        if (!res.ok) throw new Error("Failed to load projects");
        const data = await res.json();
        const select = document.getElementById("projectSelect");
        if (!select) return;

        select.innerHTML = "";
        for (const key of Object.keys(data)) {
            const opt = document.createElement("option");
            opt.value = key;
            opt.textContent = key;
            select.appendChild(opt);
        }
    } catch (err) {
        console.error(err);
        const out = document.getElementById("commandOutput");
        if (out) out.textContent = String(err);
    }
}

async function runCommand(cmd) {
    const taskId = (document.getElementById("taskIdInput")?.value || "").trim();
    const project = document.getElementById("projectSelect")?.value;

    const out = document.getElementById("commandOutput");
    if (out) out.textContent = "Running...";

    if (!taskId || !project) {
        if (out) out.textContent = "Please select a project and enter a task id (e.g. 0001).";
        return;
    }

    const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, task_id: taskId, project })
    });

    const data = await res.json().catch(() => ({}));

    const text =
        `EXIT: ${data.exitCode}\n\n` +
        (data.stdout || "") +
        (data.stderr ? "\n" + data.stderr : "");

    if (out) out.textContent = text;
}
