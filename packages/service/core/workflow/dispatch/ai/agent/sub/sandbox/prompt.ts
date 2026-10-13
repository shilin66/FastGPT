/**
 * Agent Sandbox Skills Prompt
 *
 * Implements progressive disclosure: only inject skill metadata
 * (name/description/location) into the prompt. LLM uses
 * sandbox_read_file to load full SKILL.md on demand.
 */

import { SANDBOX_RUNTIME_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import type { DeployedSkillInfo } from './types';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build skills context prompt for progressive disclosure.
 *
 * Accepts DeployedSkillInfo[] so that name/description come from SKILL.md
 * frontmatter (scanned at deploy time) rather than from the database.
 * LLM loads full SKILL.md via sandbox_read_file when needed.
 *
 * When deployedSkills is empty, only the sandbox environment section is emitted,
 * allowing the agent to use sandbox tools even without any installed skills.
 */
export function buildSkillsContextPrompt(
  deployedSkills: DeployedSkillInfo[],
  workDirectory: string,
  workspaceRoot = workDirectory
): string {
  const lines: string[] = [];

  // Skills section: only when skills are deployed
  if (deployedSkills.length > 0) {
    lines.push('<agent_skills>');
    lines.push(
      'The following skills are deployed in the sandbox environment. When a task matches a skill description, use sandbox_read_file to load the SKILL.md for detailed instructions, then execute via sandbox_* tools.'
    );
    lines.push('');
    lines.push('<available_skills>');
    for (const info of deployedSkills) {
      lines.push('  <skill>');
      lines.push(`    <name>${escapeXml(info.name)}</name>`);
      if (info.source) lines.push(`    <source>${info.source}</source>`);
      lines.push(`    <description>${escapeXml(info.description)}</description>`);
      if (info.skillMdPath) {
        lines.push(`    <location>${escapeXml(info.skillMdPath)}</location>`);
      }
      if (info.directory) {
        lines.push(`    <directory>${escapeXml(info.directory)}</directory>`);
      }
      lines.push('  </skill>');
    }
    lines.push('</available_skills>');
    lines.push('</agent_skills>');
    lines.push('');
  }

  // Sandbox environment section: always present
  lines.push('<sandbox_environment>');
  lines.push(`Workspace root: ${workspaceRoot}`);
  lines.push(`Current working directory: ${workDirectory}`);
  lines.push(SANDBOX_RUNTIME_PROMPT);
  lines.push(
    `Create reusable workspace skills at ${workspaceRoot}/skills/<name>/SKILL.md with name and description in YAML frontmatter. They will be discovered on the next conversation turn.`
  );
  lines.push(
    'Use the exact skill paths listed above. Keep managed deployment manifests and links unchanged; skill files may be edited.'
  );
  lines.push(
    'All relative file paths and the default command cwd use this current working directory.'
  );
  lines.push(
    'You have access to sandbox_* tools: read, write, edit, execute, search files, and fetch user-uploaded files.'
  );
  lines.push(
    'If the conversation includes <available_files>, use sandbox_fetch_user_file to copy files into the workspace.'
  );
  lines.push(
    'For output files, prefer relative paths such as "helloworld.html" or "outputs/report.csv". Absolute paths inside the workspace must keep the leading "/". Never use "..".'
  );
  lines.push(
    'Do not repeat the current working directory in a relative path or remove the leading "/" from an absolute path.'
  );
  lines.push(`Example: "helloworld.html" resolves to "${workDirectory}/helloworld.html".`);
  lines.push('</sandbox_environment>');

  return lines.join('\n');
}
