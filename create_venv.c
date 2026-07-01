#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#pragma comment(lib, "Shell32.lib")
#pragma comment(lib, "Shlwapi.lib")
#pragma comment(lib, "Advapi32.lib")

#define MAX_CMD 4096
#define REQUIREMENTS_FILE "requirements.txt"
#define MIRROR_URL "https://pypi.tuna.tsinghua.edu.cn/simple"

// 设置控制台颜色辅助
void set_console_color(int color) {
    SetConsoleTextAttribute(GetStdHandle(STD_OUTPUT_HANDLE), color);
}

// 恢复默认颜色
void reset_console_color() {
    set_console_color(FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
}

// 模拟 input()
void wait_for_enter() {
    int c;
    while ((c = getchar()) != '\n' && c != EOF);
}

void trim_line_endings(char* text) {
    size_t len = strlen(text);
    while (len > 0 && (text[len - 1] == '\r' || text[len - 1] == '\n' || text[len - 1] == ' ' || text[len - 1] == '\t')) {
        text[len - 1] = '\0';
        len--;
    }
}

int prompt_yes_no(const char* message) {
    char answer[32];

    for (;;) {
        printf("%s [Y/n]: ", message);
        if (!fgets(answer, sizeof(answer), stdin)) {
            return 0;
        }

        trim_line_endings(answer);
        if (answer[0] == '\0' || answer[0] == 'y' || answer[0] == 'Y') {
            return 1;
        }
        if (answer[0] == 'n' || answer[0] == 'N') {
            return 0;
        }

        printf("Please answer with Y or N.\n");
    }
}

// 检查管理员权限
BOOL is_admin() {
    BOOL fIsRunAsAdmin = FALSE;
    PSID pAdministratorsGroup = NULL;
    SID_IDENTIFIER_AUTHORITY NtAuthority = SECURITY_NT_AUTHORITY;
    if (AllocateAndInitializeSid(&NtAuthority, 2, SECURITY_BUILTIN_DOMAIN_RID,
        DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &pAdministratorsGroup)) {
        CheckTokenMembership(NULL, pAdministratorsGroup, &fIsRunAsAdmin);
        FreeSid(pAdministratorsGroup);
    }
    return fIsRunAsAdmin;
}

// 获取当前 EXE 路径
void get_current_exe_path(char* buffer) {
    GetModuleFileNameA(NULL, buffer, MAX_PATH);
}

// 以管理员权限重新运行
void run_as_admin(int argc, char* argv[]) {
    char exe_path[MAX_PATH];
    get_current_exe_path(exe_path);

    char cwd[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, cwd);

    // 构建参数
    char params[MAX_CMD] = "";
    
    // 添加 --working-dir 参数
    char working_dir_arg[MAX_PATH + 20];
    snprintf(working_dir_arg, sizeof(working_dir_arg), "--working-dir=\"%s\"", cwd);
    strcat(params, working_dir_arg);

    // 添加其他原有参数
    for (int i = 1; i < argc; i++) {
        if (strncmp(argv[i], "--working-dir", 13) != 0) {
            strcat(params, " ");
            strcat(params, argv[i]);
        }
    }

    ShellExecuteA(NULL, "runas", exe_path, params, NULL, SW_SHOW);
    exit(0);
}

// 执行命令并获取输出 (类似于 subprocess.run capture_output=True)
// 返回退出代码，输出填入 output_buffer
int run_command_capture(const char* cmd, char* output_buffer, size_t buffer_size) {
    SECURITY_ATTRIBUTES sa;
    sa.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa.bInheritHandle = TRUE;
    sa.lpSecurityDescriptor = NULL;

    HANDLE hRead, hWrite;
    if (!CreatePipe(&hRead, &hWrite, &sa, 0)) return -1;
    SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);

    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.hStdError = hWrite;
    si.hStdOutput = hWrite;
    si.dwFlags |= STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;

    ZeroMemory(&pi, sizeof(pi));

    char cmd_mutable[MAX_CMD];
    strncpy(cmd_mutable, cmd, MAX_CMD - 1);

    if (!CreateProcessA(NULL, cmd_mutable, NULL, NULL, TRUE, 0, NULL, NULL, &si, &pi)) {
        CloseHandle(hWrite);
        CloseHandle(hRead);
        return -1;
    }

    CloseHandle(hWrite); // 父进程不需要写

    DWORD bytesRead;
    char chunk[1024];
    size_t total_read = 0;
    
    if (output_buffer) output_buffer[0] = '\0';

    while (ReadFile(hRead, chunk, sizeof(chunk) - 1, &bytesRead, NULL) && bytesRead != 0) {
        chunk[bytesRead] = '\0';
        if (output_buffer && total_read < buffer_size - 1) {
            size_t remaining = buffer_size - total_read - 1;
            if (bytesRead > remaining) bytesRead = (DWORD)remaining;
            strncat(output_buffer, chunk, bytesRead);
            total_read += bytesRead;
        }
    }

    WaitForSingleObject(pi.hProcess, 10000); // 10秒超时
    DWORD exit_code;
    GetExitCodeProcess(pi.hProcess, &exit_code);

    CloseHandle(hRead);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    return (int)exit_code;
}

// 执行命令并实时打印输出 (类似于 subprocess.Popen with pipes)
int run_command_stream(const char* cmd, const char* description) {
    printf("正在%s...\n", description);

    SECURITY_ATTRIBUTES sa;
    sa.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa.bInheritHandle = TRUE;
    sa.lpSecurityDescriptor = NULL;

    HANDLE hRead, hWrite;
    if (!CreatePipe(&hRead, &hWrite, &sa, 0)) return -1;
    SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);

    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.hStdError = hWrite;
    si.hStdOutput = hWrite;
    si.dwFlags |= STARTF_USESTDHANDLES; // 显示窗口由 CreateProcess 决定，这里默认

    ZeroMemory(&pi, sizeof(pi));

    char cmd_mutable[MAX_CMD];
    strncpy(cmd_mutable, cmd, MAX_CMD - 1);

    // 某些命令可能需要 CREATE_NO_WINDOW 如果不想弹窗，或者默认
    if (!CreateProcessA(NULL, cmd_mutable, NULL, NULL, TRUE, 0, NULL, NULL, &si, &pi)) {
        CloseHandle(hWrite);
        CloseHandle(hRead);
        printf("%s时发生异常: CreateProcess failed\n", description);
        return -1;
    }

    CloseHandle(hWrite);

    DWORD bytesRead;
    char chunk[1024];
    
    // 实时读取并打印
    while (ReadFile(hRead, chunk, sizeof(chunk) - 1, &bytesRead, NULL) && bytesRead != 0) {
        chunk[bytesRead] = '\0';
        printf("%s", chunk);
    }

    WaitForSingleObject(pi.hProcess, INFINITE);
    DWORD exit_code;
    GetExitCodeProcess(pi.hProcess, &exit_code);

    CloseHandle(hRead);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    if (exit_code == 0) {
        printf("%s完成\n", description);
        return 1; // Success
    } else {
        printf("%s失败，返回码: %lu\n", description, exit_code);
        return 0; // Fail
    }
}

// 递归删除目录
int remove_directory_recursive(const char* path) {
    SHFILEOPSTRUCTA file_op = { 0 };
    char from_path[MAX_PATH + 1]; // 双重 null 结尾

    strcpy(from_path, path);
    from_path[strlen(path) + 1] = '\0'; // Double null needed for SHFileOperation

    file_op.wFunc = FO_DELETE;
    file_op.pFrom = from_path;
    file_op.fFlags = FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT;

    return SHFileOperationA(&file_op) == 0;
}

// 检查版本
// 返回 1 合适, 0 不合适
int check_python_version(const char* python_exe, char* out_version) {
    char cmd[MAX_CMD];
    snprintf(cmd, sizeof(cmd), "\"%s\" --version", python_exe);
    
    char output[1024] = { 0 };
    if (run_command_capture(cmd, output, sizeof(output)) != 0) {
        strcpy(out_version, "未知");
        return 0;
    }

    // Output example: "Python 3.12.8"
    char* p = strstr(output, "Python ");
    if (p) {
        p += 7; // Skip "Python "
        strncpy(out_version, p, 20);
        // 去除换行
        char* newline = strchr(out_version, '\r');
        if (newline) *newline = '\0';
        newline = strchr(out_version, '\n');
        if (newline) *newline = '\0';

        int major = 0, minor = 0;
        sscanf(p, "%d.%d", &major, &minor);

        // >= 3.14 不可用
        if (major > 3 || (major == 3 && minor >= 14)) {
            printf("[WARNING] 检测到Python版本 %s >= 3.14，当前版本不可用\n", out_version);
            return 0;
        }

        // >= 3.8 且 < 3.14
        if (major > 3 || (major == 3 && minor >= 8)) {
            return 1;
        }
    }
    
    return 0;
}

// 查找目录下的 python.exe (用于处理 wildcard)
void search_python_in_dir_pattern(const char* base_pattern, char paths[][MAX_PATH], int* count, int max_paths) {
    WIN32_FIND_DATAA fd;
    HANDLE hFind = FindFirstFileA(base_pattern, &fd);
    
    if (hFind == INVALID_HANDLE_VALUE) return;

    // 获取 base_pattern 的目录部分
    char dir_part[MAX_PATH];
    strcpy(dir_part, base_pattern);
    PathRemoveFileSpecA(dir_part); // 移除 Python* 保留目录

    do {
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            if (strcmp(fd.cFileName, ".") != 0 && strcmp(fd.cFileName, "..") != 0) {
                char full_dir[MAX_PATH];
                PathCombineA(full_dir, dir_part, fd.cFileName);
                
                char exe_path[MAX_PATH];
                PathCombineA(exe_path, full_dir, "python.exe");
                
                if (PathFileExistsA(exe_path) && *count < max_paths) {
                    strcpy(paths[*count], exe_path);
                    (*count)++;
                }
            }
        }
    } while (FindNextFileA(hFind, &fd));

    FindClose(hFind);
}

void find_system_python(char paths[][MAX_PATH], int* count, int max_paths) {
    *count = 0;

    // 1. 使用 where 命令
    char output[4096];
    if (run_command_capture("where python.exe", output, sizeof(output)) == 0) {
        char* token = strtok(output, "\r\n");
        while (token != NULL && *count < max_paths) {
            if (strlen(token) > 0 && PathFileExistsA(token)) {
                strcpy(paths[*count], token);
                (*count)++;
            }
            token = strtok(NULL, "\r\n");
        }
    }

    // 2. 检查常见路径 (模拟 Python 的 glob)
    const char* env_vars[] = { "SYSTEMDRIVE", "ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA" };
    const char* sub_paths[] = { 
        "%s\\Python\\Python*", 
        "%s\\Python\\Python*", 
        "%s\\Python\\Python*", 
        "%s\\Programs\\Python\\Python*" // LOCALAPPDATA case
    };
    
    // LOCALAPPDATA 默认值处理比较麻烦，简单处理
    char local_app_data[MAX_PATH];
    if (!GetEnvironmentVariableA("LOCALAPPDATA", local_app_data, MAX_PATH)) {
        // Fallback roughly
        ExpandEnvironmentStringsA("%USERPROFILE%\\AppData\\Local", local_app_data, MAX_PATH);
    }

    for (int i = 0; i < 4; i++) {
        char base_val[MAX_PATH];
        if (i == 3) {
            strcpy(base_val, local_app_data);
        } else {
            if (!GetEnvironmentVariableA(env_vars[i], base_val, MAX_PATH)) {
                if (i == 0) strcpy(base_val, "C:");
                else continue;
            }
        }

        char pattern[MAX_PATH];
        snprintf(pattern, MAX_PATH, sub_paths[i], base_val);
        search_python_in_dir_pattern(pattern, paths, count, max_paths);
    }
}

void choose_newer_file(char* best_path, FILETIME* best_time, const char* install_dir, const WIN32_FIND_DATAA* file_data) {
    char candidate_path[MAX_PATH];
    PathCombineA(candidate_path, install_dir, file_data->cFileName);

    if (!best_path[0] || CompareFileTime(&file_data->ftLastWriteTime, best_time) > 0) {
        strcpy(best_path, candidate_path);
        *best_time = file_data->ftLastWriteTime;
    }
}

void search_python_installer_in_dir(const char* install_dir, char* best_path, FILETIME* best_time) {
    WIN32_FIND_DATAA fd;
    HANDLE hFind;
    char pattern[MAX_PATH];

    if (!PathFileExistsA(install_dir)) {
        return;
    }

    PathCombineA(pattern, install_dir, "python*.exe");
    hFind = FindFirstFileA(pattern, &fd);
    if (hFind == INVALID_HANDLE_VALUE) {
        return;
    }

    do {
        if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) {
            choose_newer_file(best_path, best_time, install_dir, &fd);
        }
    } while (FindNextFileA(hFind, &fd));

    FindClose(hFind);
}

void find_python_installer(char* out_path) {
    char exe_path[MAX_PATH];
    char exe_dir[MAX_PATH];
    char cwd[MAX_PATH];
    char parent_dir[MAX_PATH];
    char install_dir[MAX_PATH];
    FILETIME best_time;

    ZeroMemory(&best_time, sizeof(best_time));
    out_path[0] = '\0';

    get_current_exe_path(exe_path);
    strcpy(exe_dir, exe_path);
    PathRemoveFileSpecA(exe_dir);

    GetCurrentDirectoryA(MAX_PATH, cwd);

    strcpy(parent_dir, exe_dir);
    PathRemoveFileSpecA(parent_dir);

    PathCombineA(install_dir, exe_dir, "install");
    search_python_installer_in_dir(install_dir, out_path, &best_time);

    PathCombineA(install_dir, cwd, "install");
    search_python_installer_in_dir(install_dir, out_path, &best_time);

    PathCombineA(install_dir, parent_dir, "install");
    search_python_installer_in_dir(install_dir, out_path, &best_time);
}

int install_bundled_python() {
    char installer_path[MAX_PATH];
    char cmd[MAX_CMD];
    int exit_code;

    find_python_installer(installer_path);
    if (!installer_path[0]) {
        printf("未找到 install 目录中的 Python 安装包。\n");
        return 0;
    }

    printf("检测到内置 Python 安装包: %s\n", installer_path);
    if (!prompt_yes_no("当前环境没有可用的 Python，是否现在安装？")) {
        printf("用户取消了 Python 安装。\n");
        return 0;
    }

    snprintf(cmd, sizeof(cmd), "\"%s\"", installer_path);
    printf("正在启动 Python 安装程序...\n");
    exit_code = run_command_capture(cmd, NULL, 0);
    if (exit_code != 0) {
        printf("Python 安装程序执行失败，返回码: %d\n", exit_code);
        return 0;
    }

    Sleep(1500);
    return 1;
}

// 检查写入权限
int check_write_permission(const char* dir) {
    char test_file[MAX_PATH];
    PathCombineA(test_file, dir, "test_write.txt");
    
    FILE* fp = fopen(test_file, "w");
    if (fp) {
        fprintf(fp, "test");
        fclose(fp);
        DeleteFileA(test_file);
        return 1;
    }
    return 0;
}

int create_virtualenv(const char* python_exe, const char* target_dir) {
    printf("使用Python: %s\n", python_exe);
    printf("目标目录: %s\n", target_dir);

    if (PathFileExistsA(target_dir)) {
        printf("目录已存在，先删除: %s\n", target_dir);
        if (!remove_directory_recursive(target_dir)) {
            printf("无法删除目录，请手动删除。\n");
        }
        Sleep(1000);
    }

    printf("尝试方法1: 使用venv模块...\n");
    char cmd[MAX_CMD];
    snprintf(cmd, sizeof(cmd), "\"%s\" -m venv \"%s\"", python_exe, target_dir);
    
    if (run_command_capture(cmd, NULL, 0) == 0) {
        printf("虚拟环境创建成功!\n");
        printf("虚拟环境位置: %s\n", target_dir);
        printf("\n激活虚拟环境:\n");
        printf("Windows: %s\\Scripts\\activate\n", target_dir);
        return 1;
    }

    printf("方法1失败，尝试方法2: 使用virtualenv...\n");
    snprintf(cmd, sizeof(cmd), "\"%s\" -m virtualenv \"%s\"", python_exe, target_dir);
    if (run_command_capture(cmd, NULL, 0) == 0) {
         printf("虚拟环境创建成功!\n");
         return 1;
    }
    printf("virtualenv可能未安装或失败。\n");

    return 0;
}

int is_uv_available() {
    return run_command_capture("uv --version", NULL, 0) == 0;
}

int main(int argc, char* argv[]) {
    // 设置编码为 UTF-8
    SetConsoleOutputCP(65001);
    SetConsoleCP(65001);

    char working_dir[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, working_dir);

    // 解析 --working-dir
    for (int i = 1; i < argc; i++) {
        if (strncmp(argv[i], "--working-dir=", 14) == 0) {
            char* val = strchr(argv[i], '=') + 1;
            // 去除引号
            char clean_path[MAX_PATH];
            int k = 0;
            for (int j = 0; val[j]; j++) {
                if (val[j] != '"') clean_path[k++] = val[j];
            }
            clean_path[k] = '\0';
            
            SetCurrentDirectoryA(clean_path);
            strcpy(working_dir, clean_path);
            break;
        }
    }

    printf("工作目录: %s\n", working_dir);
    
    char current_cwd[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, current_cwd);
    printf("当前目录: %s\n", current_cwd);

    // 检查管理员权限
    if (!is_admin()) {
        printf("需要管理员权限来创建虚拟环境\n");
        printf("正在请求管理员权限...\n");
        run_as_admin(argc, argv);
        return 0;
    }

    printf("已获取管理员权限\n");
    printf("管理员模式下的当前目录: %s\n", current_cwd);

    // 查找系统 Python
    printf("正在查找系统Python安装...\n");
    char python_paths[50][MAX_PATH];
    int path_count = 0;
    find_system_python(python_paths, &path_count, 50);

    if (path_count == 0) {
        if (!install_bundled_python()) {
            printf("鎸夊洖杞﹂敭閫€鍑?..");
            wait_for_enter();
            return 1;
        }

        find_system_python(python_paths, &path_count, 50);
        if (path_count == 0) {
            printf("Python 安装完成后仍未检测到可用解释器，请确认安装是否成功。\n");
        }
    }

    if (path_count == 0) {
        printf("未找到Python安装，请确保Python已安装\n");
        printf("按回车键退出...");
        wait_for_enter();
        return 1;
    }

    // 去重 (简单的 O(N^2) 去重，因为数量很少)
    // Python 代码中做了去重和排序，这里简化处理，只做简单的路径比较
    
    printf("找到以下Python安装: \n");
    for(int i=0; i<path_count; i++) printf("- %s\n", python_paths[i]);

    char suitable_python[MAX_PATH] = "";
    char version_str[50];

    // 检查版本
    for (int i = 0; i < path_count; i++) {
        if (check_python_version(python_paths[i], version_str)) {
            printf("找到合适的Python版本: %s (版本 %s)\n", python_paths[i], version_str);
            if (strlen(suitable_python) == 0) {
                strcpy(suitable_python, python_paths[i]);
                // 在 Python 代码中找到了就 break 吗？是的。
                break;
            }
        } else {
            printf("Python版本不符合要求: %s (版本 %s)\n", python_paths[i], version_str);
        }
    }

    if (strlen(suitable_python) == 0) {
        if (install_bundled_python()) {
            find_system_python(python_paths, &path_count, 50);
            for (int i = 0; i < path_count; i++) {
                if (check_python_version(python_paths[i], version_str)) {
                    strcpy(suitable_python, python_paths[i]);
                    printf("安装后检测到可用 Python: %s (版本 %s)\n", python_paths[i], version_str);
                    break;
                }
            }
        }
    }

    if (strlen(suitable_python) == 0) {
        printf("未找到符合要求的Python版本 (需要 >= 3.8.0 且 < 3.14.0)\n");
        printf("按回车键退出...");
        wait_for_enter();
        return 1;
    }

    // 创建虚拟环境
    char venv_dir[MAX_PATH];
    PathCombineA(venv_dir, working_dir, "venv");
    printf("正在在 %s 创建虚拟环境...\n", venv_dir);

    // 权限检查
    if (check_write_permission(working_dir)) {
        printf("写入权限检查通过\n");
    } else {
        printf("写入权限检查失败: 无法写入测试文件\n");
        printf("可能需要手动设置目录权限\n");
    }

    if (create_virtualenv(suitable_python, venv_dir)) {
        printf("虚拟环境创建成功，正在安装依赖...\n");
        
        char requirements_path[MAX_PATH];
        PathCombineA(requirements_path, working_dir, REQUIREMENTS_FILE);

        char venv_python[MAX_PATH];
        PathCombineA(venv_python, venv_dir, "Scripts");
        PathCombineA(venv_python, venv_python, "python.exe");

        if (!PathFileExistsA(requirements_path)) {
            printf("未找到依赖文件: %s\n", requirements_path);
        } else if (!PathFileExistsA(venv_python)) {
             printf("未找到虚拟环境Python: %s\n", venv_python);
        } else {
            printf("正在安装依赖: %s\n", requirements_path);
            
            int success = 0;
            char install_cmd[MAX_CMD];

            if (is_uv_available()) {
                printf("检测到uv包管理器，将优先使用uv安装依赖...\n");
                // uv pip install -r req.txt -i ... --python venv_python
                snprintf(install_cmd, sizeof(install_cmd), 
                    "uv pip install -r \"%s\" -i %s --python \"%s\"",
                    requirements_path, MIRROR_URL, venv_python);
                
                success = run_command_stream(install_cmd, "使用uv安装依赖");
                if (success) {
                    printf("✅ uv依赖安装完成!\n");
                } else {
                    printf("⚠️ uv安装失败，尝试使用pip...\n");
                }
            } else {
                printf("未检测到uv，使用pip安装依赖...\n");
            }

            if (!success) {
                // pip fallback
                // venv_python -m pip install -r req -i ...
                snprintf(install_cmd, sizeof(install_cmd),
                    "\"%s\" -m pip install -r \"%s\" -i %s",
                    venv_python, requirements_path, MIRROR_URL);
                success = run_command_stream(install_cmd, "使用pip安装依赖");
            }

            if (success) {
                printf("依赖安装完成!\n");
            } else {
                printf("依赖安装失败!\n");
            }
        }

    } else {
        printf("操作失败!\n");
    }

    printf("按回车键退出...");
    wait_for_enter();

    return 0;
}
