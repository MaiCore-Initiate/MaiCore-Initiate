
default rel

extern printf
extern snprintf
extern getenv
extern system
extern getchar
extern SetConsoleOutputCP
extern SetConsoleCP
extern GetCurrentDirectoryA
extern GetModuleFileNameA
extern PathCombineA
extern PathRemoveFileSpecA
extern PathFileExistsA

global main

%define MAX_PATH 260
%define MAX_CMD 4096

section .data
    requirements_file       db "requirements.txt", 0
    main_script_file        db "main_refactored.py", 0
    create_venv_file        db "create_venv.exe", 0
    scripts_dir             db "Scripts", 0
    python_exe_file         db "python.exe", 0
    uv_exe_file             db "uv.exe", 0

    venv_name_1             db "venv", 0
    venv_name_2             db ".venv", 0
    venv_name_3             db "env", 0
    venv_name_4             db ".env", 0
    venv_dirs               dq venv_name_1, venv_name_2, venv_name_3, venv_name_4

    env_primary             db "PIP_PRIMARY_INDEX", 0
    env_fallback            db "PIP_FALLBACK_INDEX", 0
    default_primary         db "https://pypi.tuna.tsinghua.edu.cn/simple", 0
    default_fallback        db "https://pypi.org/simple", 0

    fmt_info_workdir        db "[INFO] Working directory: %s", 10, 0
    fmt_err_missing         db "[ERROR] %s was not found.", 10, 0
    fmt_err_create_missing  db "[ERROR] create_venv.exe was not found. Tried: %s", 10, 0
    fmt_err_create_failed   db "[ERROR] create_venv.exe failed with code %d.", 10, 0
    fmt_err_no_venv_after   db "[ERROR] No virtual environment was detected after create_venv.exe finished.", 10, 0
    fmt_info_no_venv        db "[INFO] No virtual environment was found. Launching create_venv.exe...", 10, 0
    fmt_info_create_ok      db "[INFO] create_venv.exe created virtual environment successfully.", 10, 0
    fmt_info_install        db "[INFO] Checking and installing dependencies...", 10, 0
    fmt_info_uv             db "[INFO] uv detected, installing dependencies with uv first...", 10, 0
    fmt_info_uv_missing     db "[INFO] uv was not detected, trying to install uv first...", 10, 0
    fmt_warn_uv_install     db "[WARNING] uv installation failed, falling back to pip...", 10, 0
    fmt_warn_uv             db "[WARNING] uv install failed, falling back to pip...", 10, 0
    fmt_info_running        db "[INFO] Running: %s", 10, 0
    fmt_err_cmd_failed      db "[ERROR] Command failed with code %d: %s", 10, 0
    fmt_info_start_main     db "[INFO] Dependencies installed, starting main program...", 10, 0
    msg_press_enter         db "Press Enter to exit...", 0

    cmd_quote_one           db '""%s""', 0
    cmd_uv_check            db "uv --version >nul 2>nul", 0
    cmd_install_uv          db '""%s" -m pip install uv -i "%s" --extra-index-url "%s""', 0
    cmd_uv_install          db 'uv pip install -r "%s" -i "%s" --extra-index-url "%s" --python "%s"', 0
    cmd_local_uv_install    db '""%s" pip install -r "%s" -i "%s" --extra-index-url "%s" --python "%s""', 0
    cmd_pip_install         db '""%s" -m pip install -r "%s" -i "%s" --extra-index-url "%s""', 0
    cmd_run_main            db '""%s" "%s""', 0

section .bss
    cwd_buf                 resb MAX_PATH
    exe_buf                 resb MAX_PATH
    base_dir                resb MAX_PATH
    parent_dir              resb MAX_PATH
    candidate_path          resb MAX_PATH
    venv_path               resb MAX_PATH
    tmp_path                resb MAX_PATH
    python_path             resb MAX_PATH
    uv_path                 resb MAX_PATH
    primary_index           resq 1
    fallback_index          resq 1
    cmd_buf                 resb MAX_CMD

section .text

main:
    push rbp
    mov rbp, rsp
    push rbx
    sub rsp, 72

    mov ecx, 65001
    call SetConsoleOutputCP
    mov ecx, 65001
    call SetConsoleCP

    xor ecx, ecx
    lea rdx, [exe_buf]
    mov r8d, MAX_PATH
    call GetModuleFileNameA

    lea rcx, [base_dir]
    lea rdx, [exe_buf]
    call copy_string
    lea rcx, [base_dir]
    call PathRemoveFileSpecA

    mov ecx, MAX_PATH
    lea rdx, [cwd_buf]
    call GetCurrentDirectoryA

    lea rcx, [fmt_info_workdir]
    lea rdx, [cwd_buf]
    call printf

    call find_existing_venv
    test eax, eax
    jnz .venv_ready

    lea rcx, [fmt_info_no_venv]
    call printf
    call get_venv_exe_path
    lea rcx, [candidate_path]
    call PathFileExistsA
    test eax, eax
    jnz .run_create

    lea rcx, [fmt_err_create_missing]
    lea rdx, [candidate_path]
    call printf
    call wait_enter
    mov eax, 1
    jmp .done

.run_create:
    lea rcx, [cmd_buf]
    mov rdx, MAX_CMD
    lea r8, [cmd_quote_one]
    lea r9, [candidate_path]
    call snprintf

    lea rcx, [cmd_buf]
    call run_command
    test eax, eax
    jz .create_ok

    lea rcx, [fmt_err_create_failed]
    mov edx, eax
    call printf
    call wait_enter
    mov eax, 1
    jmp .done

.create_ok:
    lea rcx, [fmt_info_create_ok]
    call printf
    call find_existing_venv
    test eax, eax
    jnz .venv_ready

    lea rcx, [fmt_err_no_venv_after]
    call printf
    call wait_enter
    mov eax, 1
    jmp .done

.venv_ready:
    call build_venv_python

    lea rcx, [requirements_file]
    call PathFileExistsA
    test eax, eax
    jnz .check_main
    lea rcx, [fmt_err_missing]
    lea rdx, [requirements_file]
    call printf
    mov eax, 1
    jmp .done

.check_main:
    lea rcx, [main_script_file]
    call PathFileExistsA
    test eax, eax
    jnz .install_deps
    lea rcx, [fmt_err_missing]
    lea rdx, [main_script_file]
    call printf
    mov eax, 1
    jmp .done

.install_deps:
    lea rcx, [fmt_info_install]
    call printf

    lea rcx, [env_primary]
    call getenv
    test rax, rax
    jnz .primary_set
    lea rax, [default_primary]
.primary_set:
    mov [primary_index], rax

    lea rcx, [env_fallback]
    call getenv
    test rax, rax
    jnz .fallback_set
    lea rax, [default_fallback]
.fallback_set:
    mov [fallback_index], rax

    lea rcx, [cmd_uv_check]
    call system
    test eax, eax
    jz .try_global_uv_install_requirements

    lea rcx, [fmt_info_uv_missing]
    call printf
    lea rcx, [cmd_buf]
    mov rdx, MAX_CMD
    lea r8, [cmd_install_uv]
    lea r9, [python_path]
    mov rax, [primary_index]
    mov [rsp+32], rax
    mov rax, [fallback_index]
    mov [rsp+40], rax
    call snprintf

    lea rcx, [cmd_buf]
    call run_command
    test eax, eax
    jz .try_local_uv_install_requirements

    lea rcx, [fmt_warn_uv_install]
    call printf
    jmp .pip_fallback

.try_global_uv_install_requirements:
    lea rcx, [fmt_info_uv]
    call printf
    lea rcx, [cmd_buf]
    mov rdx, MAX_CMD
    lea r8, [cmd_uv_install]
    lea r9, [requirements_file]
    mov rax, [primary_index]
    mov [rsp+32], rax
    mov rax, [fallback_index]
    mov [rsp+40], rax
    lea rax, [python_path]
    mov [rsp+48], rax
    call snprintf

    lea rcx, [cmd_buf]
    call run_command
    test eax, eax
    jz .run_main

    lea rcx, [fmt_warn_uv]
    call printf

.try_local_uv_install_requirements:
    lea rcx, [fmt_info_uv]
    call printf
    lea rcx, [cmd_buf]
    mov rdx, MAX_CMD
    lea r8, [cmd_local_uv_install]
    lea r9, [uv_path]
    lea rax, [requirements_file]
    mov [rsp+32], rax
    mov rax, [primary_index]
    mov [rsp+40], rax
    mov rax, [fallback_index]
    mov [rsp+48], rax
    lea rax, [python_path]
    mov [rsp+56], rax
    call snprintf

    lea rcx, [cmd_buf]
    call run_command
    test eax, eax
    jz .run_main

    lea rcx, [fmt_warn_uv]
    call printf
    jmp .pip_fallback

.pip_fallback:
    lea rcx, [cmd_buf]
    mov rdx, MAX_CMD
    lea r8, [cmd_pip_install]
    lea r9, [python_path]
    lea rax, [requirements_file]
    mov [rsp+32], rax
    mov rax, [primary_index]
    mov [rsp+40], rax
    mov rax, [fallback_index]
    mov [rsp+48], rax
    call snprintf

    lea rcx, [cmd_buf]
    call run_command
    test eax, eax
    jz .run_main

    lea rcx, [fmt_err_cmd_failed]
    mov edx, eax
    lea r8, [cmd_buf]
    call printf
    mov eax, 1
    jmp .done

.run_main:
    lea rcx, [fmt_info_start_main]
    call printf
    lea rcx, [cmd_buf]
    mov rdx, MAX_CMD
    lea r8, [cmd_run_main]
    lea r9, [python_path]
    lea rax, [main_script_file]
    mov [rsp+32], rax
    call snprintf

    lea rcx, [cmd_buf]
    call run_command
    test eax, eax
    jz .success

    lea rcx, [fmt_err_cmd_failed]
    mov edx, eax
    lea r8, [cmd_buf]
    call printf
    mov eax, 1
    jmp .done

.success:
    xor eax, eax

.done:
    add rsp, 72
    pop rbx
    pop rbp
    ret

wait_enter:
    push rbp
    mov rbp, rsp
    sub rsp, 32
    lea rcx, [msg_press_enter]
    call printf
    call getchar
    add rsp, 32
    pop rbp
    ret

run_command:
    push rbp
    mov rbp, rsp
    push rbx
    sub rsp, 40
    mov rbx, rcx
    lea rcx, [fmt_info_running]
    mov rdx, rbx
    call printf
    mov rcx, rbx
    call system
    add rsp, 40
    pop rbx
    pop rbp
    ret

find_existing_venv:
    push rbp
    mov rbp, rsp
    push rbx
    sub rsp, 40
    xor ebx, ebx
.loop:
    cmp ebx, 4
    jge .not_found
    lea rcx, [tmp_path]
    lea rdx, [cwd_buf]
    lea rax, [venv_dirs]
    mov r8, [rax + rbx*8]
    call PathCombineA

    lea rcx, [candidate_path]
    lea rdx, [tmp_path]
    lea r8, [scripts_dir]
    call PathCombineA
    lea rcx, [candidate_path]
    lea rdx, [candidate_path]
    lea r8, [python_exe_file]
    call PathCombineA

    lea rcx, [candidate_path]
    call PathFileExistsA
    test eax, eax
    jnz .found
    inc ebx
    jmp .loop
.found:
    lea rcx, [venv_path]
    lea rdx, [tmp_path]
    call copy_string
    mov eax, 1
    jmp .done
.not_found:
    xor eax, eax
.done:
    add rsp, 40
    pop rbx
    pop rbp
    ret

build_venv_python:
    push rbp
    mov rbp, rsp
    sub rsp, 32
    lea rcx, [python_path]
    lea rdx, [venv_path]
    lea r8, [scripts_dir]
    call PathCombineA
    lea rcx, [python_path]
    lea rdx, [python_path]
    lea r8, [python_exe_file]
    call PathCombineA
    lea rcx, [uv_path]
    lea rdx, [venv_path]
    lea r8, [scripts_dir]
    call PathCombineA
    lea rcx, [uv_path]
    lea rdx, [uv_path]
    lea r8, [uv_exe_file]
    call PathCombineA
    add rsp, 32
    pop rbp
    ret

get_venv_exe_path:
    push rbp
    mov rbp, rsp
    sub rsp, 32
    lea rcx, [candidate_path]
    lea rdx, [base_dir]
    lea r8, [create_venv_file]
    call PathCombineA
    lea rcx, [candidate_path]
    call PathFileExistsA
    test eax, eax
    jnz .done

    lea rcx, [candidate_path]
    lea rdx, [cwd_buf]
    lea r8, [create_venv_file]
    call PathCombineA
    lea rcx, [candidate_path]
    call PathFileExistsA
    test eax, eax
    jnz .done

    lea rcx, [parent_dir]
    lea rdx, [base_dir]
    call copy_string
    lea rcx, [parent_dir]
    call PathRemoveFileSpecA
    lea rcx, [candidate_path]
    lea rdx, [parent_dir]
    lea r8, [create_venv_file]
    call PathCombineA
    lea rcx, [candidate_path]
    call PathFileExistsA
    test eax, eax
    jnz .done

    lea rcx, [candidate_path]
    lea rdx, [base_dir]
    lea r8, [create_venv_file]
    call PathCombineA
.done:
    add rsp, 32
    pop rbp
    ret

copy_string:
    push rdi
    push rsi
    mov rdi, rcx
    mov rsi, rdx
.copy_loop:
    lodsb
    stosb
    test al, al
    jnz .copy_loop
    pop rsi
    pop rdi
    ret
