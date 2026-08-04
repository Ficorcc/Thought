import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const roots = [".", ".astro", ".wrangler", "dist", "public", "src"];
const ignoredDirectories = new Set([".git", "node_modules", ".pnpm-store"]);

async function cleanDirectory(directory) {
	let entries = [];
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		return 0;
	}

	let removed = 0;
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.name.startsWith("._")) {
			await rm(path, { force: true, recursive: entry.isDirectory() });
			removed++;
			continue;
		}
		if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
			removed += await cleanDirectory(path);
		}
	}
	return removed;
}

let removed = 0;
for (const root of roots) removed += await cleanDirectory(root);
if (removed) console.log(`Removed ${removed} AppleDouble sidecar files.`);
