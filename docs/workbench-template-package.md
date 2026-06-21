# 工作台模板包 (.mcsmod)

工作台的“打包项目”会把当前模板项目导出为 `.mcsmod`。文件本体是 ISO 容器，扩展名用于区分模板包。

## 包内结构

- `mod.meta.json`：模板包元数据。
- `<mod_id>.toml`：当前项目的主模板文件。
- `cover.png` / `cover.jpg` / `cover.jpeg` / `cover.gif` / `cover.webp`：当前项目封面。包内路径以模板 `[MODINFO].cover` 或工作台项目 `cover` 字段为准。
- `[MODINFO].file_import_list` 引用的外部文件：按项目内相对路径写入，保留子目录层级。

`mod.meta.json` 的 `meta` 字段包含模板名称、模板 ID、主模板文件名、作者、邮箱、GitHub 主页、打包时间、版本、描述、封面路径、块 ID 列表和 `pack-source`。同时会携带工作台还原数据：`workbench_meta`、`visible_blocks`、`workbench_canvas_state`、`files`、`directories`。

## 导入策略

- 导入 `.mcsmod`、`.iso`、`.zip` 等归档时，后端优先查找 `mod.meta.json`。
- 找到 `mod.meta.json` 时，按元数据创建新的工作台项目，并还原文件块、块位置和连线状态。
- 如果元数据里声明了封面路径，会从包内复制封面并写回新项目的 `MOD.json`。
- 不会复用导出机器上的 `MOD.json` 顶层随机序列号；导入时始终重新生成。模板自身的 `mod_id` 保持包内定义。
- 找不到 `mod.meta.json` 时，按归档内合法模板 TOML 生成项目，并用默认位置/连接生成工作台状态；若模板 `[MODINFO].cover` 指向包内图片，也会复制为项目封面。
