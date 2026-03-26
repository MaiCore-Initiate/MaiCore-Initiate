#include <windows.h>
#include <stdio.h>
#include <string.h>

#define PATH_BUF_SIZE 4096
#define CMD_BUF_SIZE 8192

typedef struct MetaInfo {
    char app_name[256];
    char app_version[256];
    char app_exe[512];
    char build_date[256];
} MetaInfo;

static void strip_last_segment(char *path) {
    char *last_backslash = strrchr(path, '\\');
    char *last_slash = strrchr(path, '/');
    char *last_sep = last_backslash;
    if (last_slash && (!last_sep || last_slash > last_sep)) {
        last_sep = last_slash;
    }
    if (last_sep) {
        *last_sep = '\0';
    }
}

static void join_path(char *out, size_t out_size, const char *left, const char *right) {
    sprintf_s(out, out_size, "%s\\%s", left, right);
}

static int file_exists(const char *path) {
    DWORD attr = GetFileAttributesA(path);
    return attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY);
}

static int is_template_mode(const char *arg) {
    return _stricmp(arg, "-d") == 0 ||
           _stricmp(arg, "-l") == 0 ||
           _stricmp(arg, "-c") == 0 ||
           _stricmp(arg, "-com") == 0 ||
           _stricmp(arg, "deploy") == 0 ||
           _stricmp(arg, "launch") == 0 ||
           _stricmp(arg, "config") == 0 ||
           _stricmp(arg, "component") == 0;
}

static int is_version_mode(const char *arg) {
    return _stricmp(arg, "-v") == 0 ||
           _stricmp(arg, "--version") == 0 ||
           _stricmp(arg, "version") == 0 ||
           _stricmp(arg, "Version") == 0;
}

static void init_meta_defaults(MetaInfo *meta) {
    strcpy_s(meta->app_name, sizeof(meta->app_name), "MaiCoreStart");
    strcpy_s(meta->app_version, sizeof(meta->app_version), "v5.0.0-beta");
    strcpy_s(meta->app_exe, sizeof(meta->app_exe), "MaiCoreStart-v5.0.0-beta.exe");
    strcpy_s(meta->build_date, sizeof(meta->build_date), "2025-12-13");
}

static void trim_right(char *text) {
    size_t length = strlen(text);
    while (length > 0 && (text[length - 1] == '\r' || text[length - 1] == '\n' || text[length - 1] == ' ' || text[length - 1] == '\t')) {
        text[length - 1] = '\0';
        length--;
    }
}

static void trim_left(char **text) {
    while (**text == ' ' || **text == '\t') {
        (*text)++;
    }
}

static void load_meta_file(const char *meta_file, MetaInfo *meta) {
    FILE *fp = NULL;
    char line[1024];

    fopen_s(&fp, meta_file, "rb");
    if (!fp) {
        return;
    }

    while (fgets(line, sizeof(line), fp)) {
        char *key = line;
        char *value = strchr(line, '=');
        if (!value) {
            continue;
        }
        *value = '\0';
        value++;
        trim_right(key);
        trim_right(value);
        trim_left(&key);
        trim_left(&value);
        if (key[0] == '\0' || key[0] == '#') {
            continue;
        }

        if (_stricmp(key, "APP_NAME") == 0) {
            strcpy_s(meta->app_name, sizeof(meta->app_name), value);
        } else if (_stricmp(key, "APP_VERSION") == 0) {
            strcpy_s(meta->app_version, sizeof(meta->app_version), value);
        } else if (_stricmp(key, "APP_EXE") == 0) {
            strcpy_s(meta->app_exe, sizeof(meta->app_exe), value);
        } else if (_stricmp(key, "BUILD_DATE") == 0) {
            strcpy_s(meta->build_date, sizeof(meta->build_date), value);
        }
    }

    fclose(fp);
}

static void show_usage(void) {
    puts("Usage: mcsb -d <DeploymentMOD path>");
    puts("       mcsb -l <DeploymentMOD path>");
    puts("       mcsb -c <DeploymentMOD path>");
    puts("       mcsb -com <DeploymentMOD path>");
    puts("       mcsb deploy <DeploymentMOD path>");
    puts("       mcsb launch <DeploymentMOD path>");
    puts("       mcsb config <DeploymentMOD path>");
    puts("       mcsb component <DeploymentMOD path>");
    puts("");
    puts("You can pass either a template directory or a DeploymentMOD.toml file path.");
}

static int run_process(const char *command_line, const char *working_dir) {
    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    DWORD exit_code = 1;
    char mutable_command[CMD_BUF_SIZE];

    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));
    si.cb = sizeof(si);
    strcpy_s(mutable_command, sizeof(mutable_command), command_line);

    if (!CreateProcessA(NULL, mutable_command, NULL, NULL, FALSE, 0, NULL, working_dir, &si, &pi)) {
        fprintf(stderr, "Failed to start process. Win32 error: %lu\n", GetLastError());
        return 1;
    }

    WaitForSingleObject(pi.hProcess, INFINITE);
    GetExitCodeProcess(pi.hProcess, &exit_code);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return (int)exit_code;
}

int main(int argc, char *argv[]) {
    MetaInfo meta;
    char module_path[PATH_BUF_SIZE];
    char script_dir[PATH_BUF_SIZE];
    char parent_dir[PATH_BUF_SIZE];
    char meta_file[PATH_BUF_SIZE];
    char app_exe[PATH_BUF_SIZE];
    char main_script[PATH_BUF_SIZE];
    char venv_python[PATH_BUF_SIZE];
    const char *python_exe = "python";
    char command_line[CMD_BUF_SIZE];

    if (!GetModuleFileNameA(NULL, module_path, sizeof(module_path))) {
        fputs("Cannot resolve executable path.\n", stderr);
        return 1;
    }

    strcpy_s(script_dir, sizeof(script_dir), module_path);
    strip_last_segment(script_dir);
    strcpy_s(parent_dir, sizeof(parent_dir), script_dir);
    strip_last_segment(parent_dir);

    init_meta_defaults(&meta);
    join_path(meta_file, sizeof(meta_file), script_dir, "mcsb.env");
    load_meta_file(meta_file, &meta);
    join_path(app_exe, sizeof(app_exe), parent_dir, meta.app_exe);
    join_path(main_script, sizeof(main_script), parent_dir, "main_refactored.py");
    join_path(venv_python, sizeof(venv_python), parent_dir, "venv\\Scripts\\python.exe");

    if (file_exists(venv_python)) {
        python_exe = venv_python;
    }

    if (argc > 1 && is_version_mode(argv[1])) {
        printf("%s version %s\n", meta.app_name, meta.app_version);
        return 0;
    }

    if (argc > 1 && is_template_mode(argv[1])) {
        if (argc < 3) {
            show_usage();
            return 1;
        }
        sprintf_s(
            command_line,
            sizeof(command_line),
            "\"%s\" \"%s\" %s \"%s\"",
            python_exe,
            main_script,
            argv[1],
            argv[2]
        );
        return run_process(command_line, parent_dir);
    }

    if (file_exists(app_exe)) {
        sprintf_s(command_line, sizeof(command_line), "\"%s\"", app_exe);
        return run_process(command_line, parent_dir);
    }

    sprintf_s(command_line, sizeof(command_line), "\"%s\" \"%s\"", python_exe, main_script);
    return run_process(command_line, parent_dir);
}
