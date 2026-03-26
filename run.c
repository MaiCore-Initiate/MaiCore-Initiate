#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <shlwapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#pragma comment(lib, "Shlwapi.lib")

#define MAX_CMD 4096
#define MAX_OUTPUT 8192
#define REQUIREMENTS_FILE "requirements.txt"
#define MAIN_SCRIPT_FILE "main_refactored.py"
#define DEFAULT_PIP_INDEX "https://pypi.tuna.tsinghua.edu.cn/simple"
#define DEFAULT_FALLBACK_INDEX "https://pypi.org/simple"

static const char* VENV_DIRS[] = { "venv", ".venv", "env", ".env" };
static const int VENV_DIRS_COUNT = 4;

void join_path(char* dest, const char* left, const char* right) {
    PathCombineA(dest, left, right);
}

void trim_line_endings(char* text) {
    size_t len = strlen(text);
    while (len > 0 && (text[len - 1] == '\r' || text[len - 1] == '\n' || text[len - 1] == ' ' || text[len - 1] == '\t')) {
        text[len - 1] = '\0';
        len--;
    }
}

void wait_for_enter(void) {
    int c;
    while ((c = getchar()) != '\n' && c != EOF) {
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

        printf("[WARN] Please answer with Y or N.\n");
    }
}

int run_command(const char* cmd, DWORD flags) {
    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    char cmd_mutable[MAX_CMD];
    DWORD exit_code = 1;

    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));
    si.cb = sizeof(si);

    strncpy(cmd_mutable, cmd, sizeof(cmd_mutable) - 1);
    cmd_mutable[sizeof(cmd_mutable) - 1] = '\0';

    if (!CreateProcessA(NULL, cmd_mutable, NULL, NULL, FALSE, flags, NULL, NULL, &si, &pi)) {
        return -1;
    }

    WaitForSingleObject(pi.hProcess, INFINITE);
    GetExitCodeProcess(pi.hProcess, &exit_code);

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return (int)exit_code;
}

int run_command_capture(const char* cmd, char* output_buffer, size_t buffer_size) {
    SECURITY_ATTRIBUTES sa;
    HANDLE read_pipe = NULL;
    HANDLE write_pipe = NULL;
    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    char cmd_mutable[MAX_CMD];
    DWORD exit_code = 1;
    DWORD bytes_read = 0;
    size_t total = 0;
    char chunk[512];

    if (output_buffer && buffer_size > 0) {
        output_buffer[0] = '\0';
    }

    ZeroMemory(&sa, sizeof(sa));
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    if (!CreatePipe(&read_pipe, &write_pipe, &sa, 0)) {
        return -1;
    }
    SetHandleInformation(read_pipe, HANDLE_FLAG_INHERIT, 0);

    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    si.hStdOutput = write_pipe;
    si.hStdError = write_pipe;

    strncpy(cmd_mutable, cmd, sizeof(cmd_mutable) - 1);
    cmd_mutable[sizeof(cmd_mutable) - 1] = '\0';

    if (!CreateProcessA(NULL, cmd_mutable, NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        CloseHandle(write_pipe);
        CloseHandle(read_pipe);
        return -1;
    }

    CloseHandle(write_pipe);
    write_pipe = NULL;

    while (ReadFile(read_pipe, chunk, sizeof(chunk) - 1, &bytes_read, NULL) && bytes_read > 0) {
        chunk[bytes_read] = '\0';
        if (output_buffer && buffer_size > 0 && total < buffer_size - 1) {
            size_t remaining = buffer_size - total - 1;
            size_t copy_len = bytes_read < remaining ? bytes_read : remaining;
            memcpy(output_buffer + total, chunk, copy_len);
            total += copy_len;
            output_buffer[total] = '\0';
        }
    }

    WaitForSingleObject(pi.hProcess, INFINITE);
    GetExitCodeProcess(pi.hProcess, &exit_code);

    CloseHandle(read_pipe);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return (int)exit_code;
}

void add_unique_path(char paths[][MAX_PATH], int* count, int max_paths, const char* candidate) {
    int i;

    if (!candidate || !candidate[0] || !PathFileExistsA(candidate) || *count >= max_paths) {
        return;
    }

    for (i = 0; i < *count; ++i) {
        if (_stricmp(paths[i], candidate) == 0) {
            return;
        }
    }

    strncpy(paths[*count], candidate, MAX_PATH - 1);
    paths[*count][MAX_PATH - 1] = '\0';
    (*count)++;
}

void search_python_in_dir_pattern(const char* base_pattern, char paths[][MAX_PATH], int* count, int max_paths) {
    WIN32_FIND_DATAA fd;
    HANDLE find_handle;
    char dir_part[MAX_PATH];

    strncpy(dir_part, base_pattern, sizeof(dir_part) - 1);
    dir_part[sizeof(dir_part) - 1] = '\0';
    PathRemoveFileSpecA(dir_part);

    find_handle = FindFirstFileA(base_pattern, &fd);
    if (find_handle == INVALID_HANDLE_VALUE) {
        return;
    }

    do {
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            char full_dir[MAX_PATH];
            char exe_path[MAX_PATH];

            if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0) {
                continue;
            }

            join_path(full_dir, dir_part, fd.cFileName);
            join_path(exe_path, full_dir, "python.exe");
            add_unique_path(paths, count, max_paths, exe_path);
        }
    } while (FindNextFileA(find_handle, &fd));

    FindClose(find_handle);
}

void find_system_python(char paths[][MAX_PATH], int* count, int max_paths) {
    char output[MAX_OUTPUT];
    char* token;
    const char* env_vars[] = { "SYSTEMDRIVE", "ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA" };
    const char* sub_paths[] = {
        "%s\\Python\\Python*",
        "%s\\Python\\Python*",
        "%s\\Python\\Python*",
        "%s\\Programs\\Python\\Python*"
    };
    char local_app_data[MAX_PATH];
    int i;

    *count = 0;

    if (run_command_capture("where python.exe", output, sizeof(output)) == 0) {
        token = strtok(output, "\r\n");
        while (token != NULL) {
            trim_line_endings(token);
            add_unique_path(paths, count, max_paths, token);
            token = strtok(NULL, "\r\n");
        }
    }

    if (!GetEnvironmentVariableA("LOCALAPPDATA", local_app_data, MAX_PATH)) {
        ExpandEnvironmentStringsA("%USERPROFILE%\\AppData\\Local", local_app_data, MAX_PATH);
    }

    for (i = 0; i < 4; ++i) {
        char base_value[MAX_PATH];
        char pattern[MAX_PATH];

        if (i == 3) {
            strncpy(base_value, local_app_data, sizeof(base_value) - 1);
            base_value[sizeof(base_value) - 1] = '\0';
        } else if (!GetEnvironmentVariableA(env_vars[i], base_value, MAX_PATH)) {
            if (i == 0) {
                strncpy(base_value, "C:", sizeof(base_value) - 1);
                base_value[sizeof(base_value) - 1] = '\0';
            } else {
                continue;
            }
        }

        snprintf(pattern, sizeof(pattern), sub_paths[i], base_value);
        search_python_in_dir_pattern(pattern, paths, count, max_paths);
    }
}

int check_python_version(const char* python_exe, char* out_version, size_t out_version_size) {
    char cmd[MAX_CMD];
    char output[1024];
    int major = 0;
    int minor = 0;
    char* found;

    if (out_version && out_version_size > 0) {
        strncpy(out_version, "unknown", out_version_size - 1);
        out_version[out_version_size - 1] = '\0';
    }

    snprintf(cmd, sizeof(cmd), "\"%s\" --version", python_exe);
    if (run_command_capture(cmd, output, sizeof(output)) != 0) {
        return 0;
    }

    trim_line_endings(output);
    found = strstr(output, "Python ");
    if (!found) {
        return 0;
    }

    found += 7;
    if (out_version && out_version_size > 0) {
        strncpy(out_version, found, out_version_size - 1);
        out_version[out_version_size - 1] = '\0';
        trim_line_endings(out_version);
    }

    if (sscanf(found, "%d.%d", &major, &minor) != 2) {
        return 0;
    }

    if (major == 3 && minor >= 8 && minor < 14) {
        return 1;
    }

    return 0;
}

int find_suitable_python(char* out_python, size_t out_python_size) {
    char python_paths[64][MAX_PATH];
    char version[64];
    int count = 0;
    int i;

    find_system_python(python_paths, &count, 64);

    for (i = 0; i < count; ++i) {
        if (check_python_version(python_paths[i], version, sizeof(version))) {
            strncpy(out_python, python_paths[i], out_python_size - 1);
            out_python[out_python_size - 1] = '\0';
            return 1;
        }
    }

    if (out_python_size > 0) {
        out_python[0] = '\0';
    }
    return 0;
}

void choose_newer_file(char* best_path, FILETIME* best_time, const char* candidate_dir, const WIN32_FIND_DATAA* file_data) {
    char candidate_path[MAX_PATH];

    join_path(candidate_path, candidate_dir, file_data->cFileName);

    if (!best_path[0] || CompareFileTime(&file_data->ftLastWriteTime, best_time) > 0) {
        strncpy(best_path, candidate_path, MAX_PATH - 1);
        best_path[MAX_PATH - 1] = '\0';
        *best_time = file_data->ftLastWriteTime;
    }
}

void search_python_installer_in_dir(const char* install_dir, char* best_path, FILETIME* best_time) {
    WIN32_FIND_DATAA fd;
    HANDLE find_handle;
    char pattern[MAX_PATH];

    if (!PathFileExistsA(install_dir)) {
        return;
    }

    join_path(pattern, install_dir, "python*.exe");
    find_handle = FindFirstFileA(pattern, &fd);
    if (find_handle == INVALID_HANDLE_VALUE) {
        return;
    }

    do {
        if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) {
            choose_newer_file(best_path, best_time, install_dir, &fd);
        }
    } while (FindNextFileA(find_handle, &fd));

    FindClose(find_handle);
}

void get_base_directory(char* out_dir) {
    GetModuleFileNameA(NULL, out_dir, MAX_PATH);
    PathRemoveFileSpecA(out_dir);
}

void find_python_installer(char* out_path) {
    char base_dir[MAX_PATH];
    char cwd[MAX_PATH];
    char parent_dir[MAX_PATH];
    char install_dir[MAX_PATH];
    FILETIME best_time;

    ZeroMemory(&best_time, sizeof(best_time));
    out_path[0] = '\0';

    get_base_directory(base_dir);
    GetCurrentDirectoryA(MAX_PATH, cwd);

    strncpy(parent_dir, base_dir, sizeof(parent_dir) - 1);
    parent_dir[sizeof(parent_dir) - 1] = '\0';
    PathRemoveFileSpecA(parent_dir);

    join_path(install_dir, base_dir, "install");
    search_python_installer_in_dir(install_dir, out_path, &best_time);

    join_path(install_dir, cwd, "install");
    search_python_installer_in_dir(install_dir, out_path, &best_time);

    join_path(install_dir, parent_dir, "install");
    search_python_installer_in_dir(install_dir, out_path, &best_time);
}

int ensure_suitable_python_available(void) {
    char python_exe[MAX_PATH];
    char installer_path[MAX_PATH];
    char installer_cmd[MAX_CMD];
    int install_exit_code;

    if (find_suitable_python(python_exe, sizeof(python_exe))) {
        printf("[INFO] Found suitable Python: %s\n", python_exe);
        return 1;
    }

    printf("[WARN] No suitable Python runtime was detected. Python 3.8 to 3.13 is required.\n");
    find_python_installer(installer_path);
    if (!installer_path[0]) {
        printf("[ERROR] No bundled Python installer was found under the install directory.\n");
        return 0;
    }

    printf("[INFO] Bundled installer detected: %s\n", installer_path);
    if (!prompt_yes_no("Install the bundled Python package now?")) {
        printf("[ERROR] Python installation was declined by the user.\n");
        return 0;
    }

    snprintf(installer_cmd, sizeof(installer_cmd), "\"%s\"", installer_path);
    printf("[INFO] Launching Python installer...\n");
    install_exit_code = run_command(installer_cmd, 0);
    if (install_exit_code != 0) {
        printf("[ERROR] Python installer exited with code %d.\n", install_exit_code);
        return 0;
    }

    Sleep(1500);
    if (!find_suitable_python(python_exe, sizeof(python_exe))) {
        printf("[ERROR] Python was still not detected after the installer finished.\n");
        printf("[ERROR] Make sure the installation completed successfully, then run this launcher again.\n");
        return 0;
    }

    printf("[INFO] Python installation completed: %s\n", python_exe);
    return 1;
}

void get_venv_exe_path(char* out_path) {
    char base_dir[MAX_PATH];
    char cwd[MAX_PATH];
    char candidate[MAX_PATH];
    char parent_dir[MAX_PATH];

    get_base_directory(base_dir);
    GetCurrentDirectoryA(MAX_PATH, cwd);

    join_path(candidate, base_dir, "create_venv.exe");
    if (PathFileExistsA(candidate)) {
        strcpy(out_path, candidate);
        return;
    }

    join_path(candidate, cwd, "create_venv.exe");
    if (PathFileExistsA(candidate)) {
        strcpy(out_path, candidate);
        return;
    }

    strncpy(parent_dir, base_dir, sizeof(parent_dir) - 1);
    parent_dir[sizeof(parent_dir) - 1] = '\0';
    PathRemoveFileSpecA(parent_dir);
    join_path(candidate, parent_dir, "create_venv.exe");
    if (PathFileExistsA(candidate)) {
        strcpy(out_path, candidate);
        return;
    }

    strcpy(out_path, "");
}

int find_existing_venv(char* out_venv_path) {
    char cwd[MAX_PATH];
    char candidate[MAX_PATH];
    char python_path[MAX_PATH];
    int i;

    GetCurrentDirectoryA(MAX_PATH, cwd);

    for (i = 0; i < VENV_DIRS_COUNT; ++i) {
        join_path(candidate, cwd, VENV_DIRS[i]);
        join_path(python_path, candidate, "Scripts");
        join_path(python_path, python_path, "python.exe");

        if (PathFileExistsA(python_path)) {
            strcpy(out_venv_path, candidate);
            return 1;
        }
    }

    return 0;
}

void get_venv_python(const char* venv_path, char* out_python) {
    join_path(out_python, venv_path, "Scripts");
    join_path(out_python, out_python, "python.exe");
}

int ensure_venv_exists(char* out_venv_path) {
    char venv_exe[MAX_PATH];
    char cmd_venv[MAX_CMD];
    int result;

    if (find_existing_venv(out_venv_path)) {
        return 1;
    }

    get_venv_exe_path(venv_exe);
    if (!venv_exe[0] || !PathFileExistsA(venv_exe)) {
        printf("[ERROR] create_venv.exe was not found.\n");
        return 0;
    }

    snprintf(cmd_venv, sizeof(cmd_venv), "\"%s\"", venv_exe);
    printf("[INFO] No virtual environment was found. Launching create_venv.exe...\n");
    result = run_command(cmd_venv, CREATE_NEW_CONSOLE);
    if (result != 0) {
        printf("[ERROR] create_venv.exe failed with code %d.\n", result);
        return 0;
    }

    if (!find_existing_venv(out_venv_path)) {
        printf("[ERROR] No virtual environment was detected after create_venv.exe finished.\n");
        return 0;
    }

    return 1;
}

void run_in_venv(const char* python_exe, const char* args) {
    char full_cmd[MAX_CMD];
    int result;

    snprintf(full_cmd, sizeof(full_cmd), "\"%s\" %s", python_exe, args);
    printf("[INFO] Running: %s\n", full_cmd);

    result = run_command(full_cmd, 0);
    if (result != 0) {
        printf("[ERROR] Command failed with code %d.\n", result);
        exit(result);
    }
}

int main(void) {
    char base_dir[MAX_PATH];
    char venv_path[MAX_PATH];
    char python_exe[MAX_PATH];
    char primary_index[256];
    char fallback_index[256];
    char pip_args[MAX_CMD];
    char main_args[MAX_CMD];

    SetConsoleOutputCP(65001);
    SetConsoleCP(65001);

    get_base_directory(base_dir);
    SetCurrentDirectoryA(base_dir);

    printf("[INFO] Working directory: %s\n", base_dir);

    if (!ensure_suitable_python_available()) {
        printf("Press Enter to exit...");
        wait_for_enter();
        return 1;
    }

    if (!ensure_venv_exists(venv_path)) {
        printf("Press Enter to exit...");
        wait_for_enter();
        return 1;
    }

    get_venv_python(venv_path, python_exe);

    if (!PathFileExistsA(REQUIREMENTS_FILE)) {
        printf("[ERROR] %s was not found.\n", REQUIREMENTS_FILE);
        printf("Press Enter to exit...");
        wait_for_enter();
        return 1;
    }

    if (!PathFileExistsA(MAIN_SCRIPT_FILE)) {
        printf("[ERROR] %s was not found.\n", MAIN_SCRIPT_FILE);
        printf("Press Enter to exit...");
        wait_for_enter();
        return 1;
    }

    if (GetEnvironmentVariableA("PIP_PRIMARY_INDEX", primary_index, sizeof(primary_index)) == 0) {
        strncpy(primary_index, DEFAULT_PIP_INDEX, sizeof(primary_index) - 1);
        primary_index[sizeof(primary_index) - 1] = '\0';
    }

    if (GetEnvironmentVariableA("PIP_FALLBACK_INDEX", fallback_index, sizeof(fallback_index)) == 0) {
        strncpy(fallback_index, DEFAULT_FALLBACK_INDEX, sizeof(fallback_index) - 1);
        fallback_index[sizeof(fallback_index) - 1] = '\0';
    }

    snprintf(
        pip_args,
        sizeof(pip_args),
        "-m pip install -r \"%s\" -i \"%s\" --extra-index-url \"%s\"",
        REQUIREMENTS_FILE,
        primary_index,
        fallback_index
    );
    run_in_venv(python_exe, pip_args);

    snprintf(main_args, sizeof(main_args), "\"%s\"", MAIN_SCRIPT_FILE);
    run_in_venv(python_exe, main_args);

    return 0;
}
