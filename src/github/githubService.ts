import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

export class GitHubService {
    /**
     * Validates a GitHub repository URL format.
     */
    static validateRepoUrl(url: string): { valid: boolean; owner?: string; repo?: string; error?: string } {
        const patterns = [
            /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(\.git)?$/,
            /^git@github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(\.git)?$/,
        ];

        for (const pattern of patterns) {
            const match = url.trim().match(pattern);
            if (match && match[1] && match[2]) {
                return { valid: true, owner: match[1], repo: match[2] };
            }
        }

        return { valid: false, error: 'Invalid GitHub repository URL. Expected format: https://github.com/owner/repo' };
    }

    /**
     * Checks if a GitHub repository is accessible.
     */
    static async checkRepoAccessibility(url: string): Promise<boolean> {
        try {
            const { valid, owner, repo } = this.validateRepoUrl(url);
            if (!valid || !owner || !repo) return false;

            const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
            const headers: Record<string, string> = {
                'User-Agent': 'HackathonEvaluator/1.0',
                'Accept': 'application/vnd.github.v3+json',
            };
            if (config.githubToken) {
                headers['Authorization'] = `token ${config.githubToken}`;
            }

            const response = await fetch(apiUrl, { headers });
            return response.ok;
        } catch (error: any) {
            logger.error(`Failed to check repo accessibility: ${error.message}`);
            return false;
        }
    }

    /**
     * Clones a GitHub repository to a local directory.
     */
    static async cloneRepo(url: string, targetDir: string): Promise<string> {
        await fs.ensureDir(config.reposDir);

        const { valid, owner, repo, error } = this.validateRepoUrl(url);
        if (!valid || !owner || !repo) {
            throw new Error(error || 'Invalid repo URL');
        }

        const repoPath = path.join(targetDir, `${owner}_${repo}`);

        // If already cloned, pull latest
        if (await fs.pathExists(repoPath)) {
            logger.info(`Repository already exists at ${repoPath}, pulling latest...`);
            const git = simpleGit(repoPath);
            await git.pull();
            return repoPath;
        }

        logger.info(`Cloning ${url} to ${repoPath}...`);
        const git = simpleGit();
        await git.clone(url, repoPath, ['--depth', '1']);
        logger.info(`Successfully cloned ${url}`);
        return repoPath;
    }

    /**
     * Fetches repository metadata from GitHub API.
     */
    static async getRepoMetadata(owner: string, repo: string): Promise<Record<string, any> | null> {
        try {
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
            const headers: Record<string, string> = {
                'User-Agent': 'HackathonEvaluator/1.0',
                'Accept': 'application/vnd.github.v3+json',
            };
            if (config.githubToken) {
                headers['Authorization'] = `token ${config.githubToken}`;
            }

            const response = await fetch(apiUrl, { headers });
            if (!response.ok) return null;
            return await response.json() as Record<string, any>;
        } catch (error: any) {
            logger.error(`Failed to fetch repo metadata: ${error.message}`);
            return null;
        }
    }

    /**
     * Gets the directory structure of a local repository.
     */
    static async getRepoStructure(repoPath: string, maxDepth = 3): Promise<string[]> {
        const files: string[] = [];

        async function walk(dir: string, depth: number) {
            if (depth > maxDepth) return;
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(repoPath, fullPath);
                files.push(relativePath);
                if (entry.isDirectory()) {
                    await walk(fullPath, depth + 1);
                }
            }
        }

        await walk(repoPath, 0);
        return files;
    }
}
