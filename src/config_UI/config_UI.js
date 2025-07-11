const apiBase = "http://127.0.0.1:8000/api";

const fieldLabels = {
    serial_number: "用户序列号",
    absolute_serial_number: "绝对序列号",
    version_path: "版本号",
    nickname_path: "示例昵称",
    mai_path: "麦麦本体路径",
    adapter_path: "适配器路径",
    napcat_path: "NapCat路径",
    venv_path: "虚拟环境路径",
    mongodb_path: "MongoDB路径",
    webui_path: "WebUI路径"
};

function createCard(name, data) {
    const card = document.createElement("div");
    card.className = "config-card";
    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="config-title">${name}</div>
            <button class="btn btn-delete" title="删除" style="padding:2px 10px;font-size:14px;">×</button>
        </div>
        <div class="config-info">序列号: ${data.serial_number || ""}</div>
        <div class="config-info">绝对序号: ${data.absolute_serial_number || ""}</div>
        <div class="config-info">版本: ${data.version_path || ""}</div>
        <div class="config-info">昵称: ${data.nickname_path || ""}</div>
    `;
    card.onclick = (e) => {
        if (e.target.classList.contains("btn-delete")) return;
        showModal(name, data);
    };
    card.querySelector(".btn-delete").onclick = (e) => {
        e.stopPropagation();
        if (confirm(`确定要删除配置集 "${name}" 吗？`)) {
            fetch(`${apiBase}/configs/${name}`, { method: "DELETE" })
                .then(r => r.json()).then(res => {
                    if (res.success) loadConfigs();
                    else alert("删除失败: " + (res.msg || ""));
                });
        }
    };
    return card;
}

function renderConfigs(configs) {
    const list = document.getElementById("config-list");
    list.innerHTML = "";
    Object.entries(configs).forEach(([name, data]) => {
        list.appendChild(createCard(name, data));
    });
}

document.getElementById("add-config-btn").onclick = () => {
    // 默认字段
    const emptyConfig = {
        serial_number: "",
        absolute_serial_number: "",
        version_path: "",
        nickname_path: "",
        mai_path: "",
        adapter_path: "",
        napcat_path: "",
        venv_path: "",
        mongodb_path: "",
        webui_path: "",
        install_options: {
            install_adapter: false,
            install_napcat: false,
            install_mongodb: false,
            install_webui: false
        }
    };
    showModal("", emptyConfig, true);
};

async function showModal(name, data, isNew = false) {
    const modal = document.getElementById("modal");
    const content = document.getElementById("modal-content");
    content.innerHTML = "";
    let editableInstall = false;
    if (!isNew && name) {
        const res = await fetch(`${apiBase}/configs/${name}/uiinfo`).then(r => r.json());
        editableInstall = res.editable_install_options;
    } else if (isNew) {
        editableInstall = true;
    }
    const form = document.createElement("form");
    form.onsubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const update = {};
        for (let [k, v] of formData.entries()) {
            if (k.startsWith("install_options_")) {
                const opt = k.replace("install_options_", "");
                if (!update.install_options) update.install_options = {};
                update.install_options[opt] = true;
            } else {
                update[k] = v;
            }
        }
        // 补全未勾选的安装项为false
        if (data.install_options) {
            Object.keys(data.install_options).forEach(opt => {
                if (!update.install_options) update.install_options = {};
                if (!(opt in update.install_options)) update.install_options[opt] = false;
            });
        }
        if (isNew) {
            // 新建时需输入配置集名称
            const newName = formData.get("config_name");
            if (!newName) {
                alert("请填写配置集名称");
                return;
            }
            fetch(`${apiBase}/configs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName, config: update })
            }).then(r => r.json()).then(res => {
                if (res.success) {
                    modal.classList.remove("show");
                    loadConfigs();
                } else {
                    alert("新建失败: " + (res.msg || ""));
                }
            });
        } else {
            fetch(`${apiBase}/configs/${name}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(update)
            }).then(r => r.json()).then(res => {
                if (res.success) {
                    modal.classList.remove("show");
                    loadConfigs();
                } else {
                    alert("保存失败: " + (res.msg || ""));
                }
            });
        }
    };
    if (isNew) {
        const row = document.createElement("div");
        row.className = "form-row";
        row.innerHTML = `<label>配置集名称</label>
            <input name="config_name" required placeholder="如：my_config"/>`;
        form.appendChild(row);
    }
    for (let [k, v] of Object.entries(data)) {
        if (typeof v === "object" && v !== null) continue;
        const row = document.createElement("div");
        row.className = "form-row";
        let label = fieldLabels[k] || k;
        let readonly = k === "absolute_serial_number" && !isNew ? "readonly" : "";
        row.innerHTML = `<label>${label}</label>
            <input name="${k}" value="${v ?? ""}" ${readonly}/>`;
        form.appendChild(row);
    }
    // 安装项
    if (data.install_options) {
        const div = document.createElement("div");
        div.className = "install-options";
        div.innerHTML = "<b>安装选项" + (editableInstall ? "" : "（只读）") + "</b><br>";
        Object.entries(data.install_options).forEach(([k, v]) => {
            if (editableInstall) {
                div.innerHTML += `
                    <label style="margin-right:12px;">
                        <input type="checkbox" name="install_options_${k}" ${v ? "checked" : ""}/>
                        ${k}
                    </label>
                `;
            } else {
                div.innerHTML += `${k}: ${v}<br>`;
            }
        });
        form.appendChild(div);
    }
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    actions.innerHTML = `
        <button type="button" class="btn cancel">取消</button>
        ${!isNew ? `<button type="button" class="btn btn-delete" style="background:#e74c3c;">删除</button>` : ""}
        <button type="submit" class="btn">${isNew ? "新建" : "保存"}</button>
    `;
    actions.querySelector(".cancel").onclick = () => modal.classList.remove("show");
    if (!isNew) {
        actions.querySelector(".btn-delete").onclick = () => {
            if (confirm(`确定要删除配置集 "${name}" 吗？`)) {
                fetch(`${apiBase}/configs/${name}`, { method: "DELETE" })
                    .then(r => r.json()).then(res => {
                        if (res.success) {
                            modal.classList.remove("show");
                            loadConfigs();
                        } else {
                            alert("删除失败: " + (res.msg || ""));
                        }
                    });
            }
        };
    }
    form.appendChild(actions);

    content.appendChild(form);
    modal.classList.add("show");
}

function loadConfigs() {
    fetch(`${apiBase}/configs`).then(r => r.json()).then(renderConfigs);
}

function applyTheme(theme) {
    if (theme === "auto") {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    } else {
        document.documentElement.setAttribute("data-theme", theme);
    }
}
async function saveThemeToServer(theme) {
    await fetch(`${apiBase}/ui_settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme })
    });
}
async function loadThemeFromServer() {
    const res = await fetch(`${apiBase}/ui_settings`).then(r => r.json());
    return res.theme || "auto";
}

function saveTheme(theme) {
    localStorage.setItem("theme-mode", theme);
    saveThemeToServer(theme);
}
function loadTheme() {
    return localStorage.getItem("theme-mode") || "auto";
}

window.onload = async () => {
    loadConfigs();
    // 点击遮罩关闭
    document.getElementById("modal").onclick = e => {
        if (e.target === e.currentTarget) e.currentTarget.classList.remove("show");
    };
    // 只保留这一行，绑定自定义设置弹窗
    document.getElementById("settings-btn").onclick = showSettingsModal;

    // 主题初始化（优先从后端加载）
    let serverTheme = await loadThemeFromServer();
    applyTheme(serverTheme);
    saveTheme(serverTheme);
    // 跟随系统变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (loadTheme() === "auto") applyTheme("auto");
    });
};

function showSettingsModal() {
    const modal = document.getElementById("modal");
    const content = document.getElementById("modal-content");
    content.innerHTML = `
        <h2 style="margin-top:0;">设置</h2>
        <div class="form-row">
            <label style="width:120px;">主题模式</label>
            <select id="theme-select-modal" class="btn" style="min-width:120px;">
                <option value="auto">跟随系统</option>
                <option value="light">明亮</option>
                <option value="dark">暗色</option>
            </select>
        </div>
        <details id="advanced-settings" style="margin-top:18px;">
            <summary style="font-size:16px;cursor:pointer;">高级设置</summary>
            <div class="form-row" style="margin-top:12px;">
                <label style="width:120px;">通信端口</label>
                <input id="port-input" type="number" min="1" max="65535" style="flex:1;" placeholder="8000"/>
            </div>
            <div style="color:#888;font-size:13px;margin-left:120px;">修改端口后需重启服务生效</div>
        </details>
        <div class="modal-actions">
            <button type="button" class="btn cancel">关闭</button>
            <button type="button" class="btn" id="save-settings-btn">保存设置</button>
        </div>
    `;
    // 设置当前主题
    const themeSelect = content.querySelector("#theme-select-modal");
    loadThemeFromServer().then(serverTheme => {
        themeSelect.value = serverTheme;
    });
    // 读取端口
    fetch(`${apiBase}/ui_settings`).then(r => r.json()).then(res => {
        if (res.port) content.querySelector("#port-input").value = res.port;
    });
    themeSelect.onchange = () => {
        applyTheme(themeSelect.value);
        saveTheme(themeSelect.value);
    };
    content.querySelector(".cancel").onclick = () => modal.classList.remove("show");
    // 保存设置
    content.querySelector("#save-settings-btn").onclick = async () => {
        const port = content.querySelector("#port-input").value;
        const theme = themeSelect.value;
        // 保存到后端
        await fetch(`${apiBase}/ui_settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme, port })
        });
        alert("设置已保存，端口修改需重启服务后生效。");
        modal.classList.remove("show");
        applyTheme(theme);
        saveTheme(theme);
    };
    modal.classList.add("show");
}