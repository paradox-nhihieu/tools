import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import type { APICacheOptions, APIQueryParams } from './types';
import { scanDirectory } from '../misc/scan';
import { mkdir } from '../misc/mkdir';

const cacheVersion = 1;

interface StoredFile {
	filename: string;
	expires: number;
}
const storedFiles: Record<string, Record<string, StoredFile>> = Object.create(
	null
);

/**
 * Unique key
 */
export function apiCacheKey(query: APIQueryParams): string {
	const item = JSON.stringify({
		uri: query.uri,
		params: query.params?.toString(),
		headers: query.headers,
	});
	return createHash('md5').update(item).digest('hex');
}

/**
 * Store cache
 */
export async function storeAPICache(
	options: APICacheOptions,
	key: string,
	data: string
): Promise<void> {
	const expires = Date.now() + options.ttl * 1000;
	const filename = options.dir + '/' + key + '.' + expires + '.json';
	if (!storedFiles[options.dir]) {
		await getStoredFiles(options.dir);
	}

	await fs.writeFile(
		filename,
		JSON.stringify(
			{
				version: cacheVersion,
				expires,
				data,
			},
			null,
			4
		),
		'utf8'
	);
	storedFiles[options.dir][key] = {
		filename,
		expires,
	};
}

/**
 *
 */
export async function getAPICache(
	dir: string,
	key: string
): Promise<string | null> {
	if (!storedFiles[dir]) {
		await getStoredFiles(dir);
	}
	const item = storedFiles[dir][key];
	if (!item) {
		return null;
	}
	const time = Date.now();

	try {
		const content = JSON.parse(await fs.readFile(item.filename, 'utf8'));
		return content.version === cacheVersion && content.expires > time
			? content.data
			: null;
	} catch (err) {
		return null;
	}
}

/**
 * Find all stored files
 */
async function getStoredFiles(dir: string): Promise<void> {
	const storage = storedFiles[dir] || Object.create(null);
	const time = Date.now();
	storedFiles[dir] = storage;

	// Create directory if missing
	await mkdir(dir);

	// Find all files
	await scanDirectory(
		dir,
		async (ext, file, subdir, path) => {
			if (ext !== '.json') {
				return false;
			}

			const filename = path + subdir + file + ext;
			const parts = file.split('.');
			const expires = parseInt(parts.pop() as string);
			if (expires < time || parts.length !== 1) {
				// Expired or invalid
				await fs.unlink(filename);
				return false;
			}

			// Valid
			const cacheKey = parts[0] as string;
			storage[cacheKey] = {
				filename,
				expires,
			};
		},
		false
	);
}
