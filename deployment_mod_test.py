from __future__ import annotations

import sys

from src.modules.deployment_mod.test_cli import deployment_mod_test_cli_runner


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        print("Usage: deployment_mod_test.py <DeploymentMOD path>")
        return 1
    return deployment_mod_test_cli_runner.run(args[0])


if __name__ == "__main__":
    raise SystemExit(main())

