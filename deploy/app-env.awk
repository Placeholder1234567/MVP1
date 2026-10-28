# Merges the default app settings (stdin) with deploy/app.env.yaml for
# gcloud's --env-vars-file (deploy.sh app_env):
#   app_defaults ... | awk -f deploy/app-env.awk deploy/app.env.yaml -
# gcloud keeps the first of two equal keys, so a default that the file also
# sets is left out, then the file is printed after the defaults. The file is
# told apart by name, not by record counts, so an empty file changes nothing.
FILENAME == ARGV[1] {
	if (match($0, /^[A-Za-z_][A-Za-z0-9_]*:/)) set[substr($0, 1, RLENGTH)] = 1
	extra[++n] = $0
	next
}
!(match($0, /^[A-Za-z_][A-Za-z0-9_]*:/) && substr($0, 1, RLENGTH) in set)
END {
	for (i = 1; i <= n; i++) print extra[i]
}
