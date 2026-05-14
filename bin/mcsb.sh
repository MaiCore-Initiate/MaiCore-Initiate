#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
META_FILE="${SCRIPT_DIR}/mcsb.env"
APP_NAME="MaiCoreStart"
APP_VERSION="v5.0.0-beta"
APP_EXE_NAME="MaiCoreStart-v5.0.0-beta.exe"
BUILD_DATE="2025-12-13"
MAIN_SCRIPT="${PARENT_DIR}/main_refactored.py"
TEST_SCRIPT="${PARENT_DIR}/deployment_mod_test.py"
VENV_PYTHON_WIN="${PARENT_DIR}/venv/Scripts/python.exe"
VENV_PYTHON_POSIX="${PARENT_DIR}/venv/bin/python"

if [[ -f "${META_FILE}" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "${key}" ]] && continue
    [[ "${key}" =~ ^# ]] && continue
    case "${key}" in
      APP_NAME) APP_NAME="${value}" ;;
      APP_VERSION) APP_VERSION="${value}" ;;
      APP_EXE) APP_EXE_NAME="${value}" ;;
      BUILD_DATE) BUILD_DATE="${value}" ;;
    esac
  done < "${META_FILE}"
fi

APP_EXE="${PARENT_DIR}/${APP_EXE_NAME}"

show_usage() {
  cat <<'EOF'
Usage: mcsb -d <DeploymentMOD path>
       mcsb -l <DeploymentMOD path>
       mcsb -c <DeploymentMOD path>
       mcsb -com <DeploymentMOD path>
       mcsb -u <DeploymentMOD path>
       mcsb -t <DeploymentMOD path>
       mcsb deploy <DeploymentMOD path>
       mcsb launch <DeploymentMOD path>
       mcsb config <DeploymentMOD path>
       mcsb component <DeploymentMOD path>
       mcsb uninstall <DeploymentMOD path>
       mcsb test <DeploymentMOD path>
       mcsb login github.com

You can pass either a template directory or a DeploymentMOD.toml file path.
Use login github.com to start GitHub account authorization.
EOF
}

show_version() {
  printf '%s version %s\n' "${APP_NAME}" "${APP_VERSION}"
}

resolve_python() {
  if [[ -f "${VENV_PYTHON_POSIX}" ]]; then
    printf '%s\n' "${VENV_PYTHON_POSIX}"
    return
  fi
  if [[ -f "${VENV_PYTHON_WIN}" ]]; then
    printf '%s\n' "${VENV_PYTHON_WIN}"
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return
  fi
  printf '%s\n' "python"
}

run_template_mode() {
  local mode="$1"
  local template_path="${2:-}"
  if [[ -z "${template_path}" ]]; then
    show_usage
    exit 1
  fi

  local python_exe
  python_exe="$(resolve_python)"
  export MCSB_CALLER_CWD="${PWD}"
  echo "Starting template action ${mode}..."
  "${python_exe}" "${MAIN_SCRIPT}" "${mode}" "${template_path}"
}

run_template_test() {
  local template_path="${1:-}"
  if [[ -z "${template_path}" ]]; then
    show_usage
    exit 1
  fi

  local python_exe
  python_exe="$(resolve_python)"
  export MCSB_CALLER_CWD="${PWD}"
  echo "Starting template syntax validation..."
  "${python_exe}" "${TEST_SCRIPT}" "${template_path}"
}

run_login_provider() {
  local provider="${1:-}"
  if [[ -z "${provider}" ]]; then
    show_usage
    exit 1
  fi
  if [[ "${provider,,}" != "github.com" ]]; then
    printf 'Unsupported login provider: %s\n' "${provider}" >&2
    printf '%s\n' "Supported provider: github.com" >&2
    exit 1
  fi

  local python_exe
  python_exe="$(resolve_python)"
  "${python_exe}" "${MAIN_SCRIPT}" login "${provider}"
}

first_arg="${1:-}"
case "${first_arg}" in
  -d|-l|-c|-com|-u|deploy|launch|config|component|uninstall)
    run_template_mode "${first_arg}" "${2:-}"
    ;;
  -t|test)
    run_template_test "${2:-}"
    ;;
  login)
    run_login_provider "${2:-}"
    ;;
  -v|version|--version|Version)
    show_version
    exit 0
    ;;
esac

if [[ -f "${APP_EXE}" ]]; then
  echo "Starting ${APP_EXE_NAME}..."
  "${APP_EXE}"
  exit $?
fi

python_exe="$(resolve_python)"
echo "Executable not found, fallback to Python entry..."
"${python_exe}" "${MAIN_SCRIPT}"
