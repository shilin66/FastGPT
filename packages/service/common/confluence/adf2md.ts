'use strict';

export module Converter {
  type NodeType =
    | 'doc'
    | 'text'
    | 'paragraph'
    | 'panel'
    | 'expand'
    | 'nestedExpand'
    | 'heading'
    | 'hardBreak'
    | 'inlineCard'
    | 'blockCard'
    | 'embedCard'
    | 'blockquote'
    | 'bulletList'
    | 'orderedList'
    | 'listItem'
    | 'codeBlock'
    | 'rule'
    | 'emoji'
    | 'media'
    | 'mediaSingle'
    | 'mediaGroup'
    | 'mediaInline'
    | 'table'
    | 'tableRow'
    | 'tableHeader'
    | 'tableCell';

  interface Node {
    type: NodeType;
    content?: Node[];
    attrs?: Record<string, any>;
    marks?: Mark[];
    text?: string;
  }

  interface Mark {
    type: string;
    attrs?: Record<string, any>;
  }

  interface ADF {
    type: 'doc';
    version: number;
    content: Node[];
  }

  function _convert(node: Node, warnings: Set<string>, thisContext?: { order?: number }): string {
    const content = node.content || [];

    switch (node.type) {
      case 'doc':
        return content.map((child) => _convert(child, warnings)).join('\n\n');

      case 'text':
        return _convertMarks(node, warnings);

      case 'panel':
      case 'paragraph':
      case 'expand':
      case 'nestedExpand':
        return content.map((child) => _convert(child, warnings)).join('');

      case 'heading':
        return `${'#'.repeat(node.attrs?.level || 1)} ${content.map((child) => _convert(child, warnings)).join('')}`;

      case 'hardBreak':
        return '\n';

      case 'inlineCard':
      case 'blockCard':
      case 'embedCard':
        return `[${node.attrs?.url}](${node.attrs?.url})`;

      case 'blockquote':
        return `> ${content.map((child) => _convert(child, warnings)).join('\n> ')}`;
      case 'mediaSingle':
      case 'mediaGroup':
        return content.map((child) => _convert(child, warnings)).join('');
      case 'media':
        return `\n![${node.attrs?.alt || ''}](${node.attrs?.id})`;
      case 'mediaInline':
        return `![](${node.attrs?.id})`;
      case 'bulletList':
      case 'orderedList': {
        let order = node.type === 'orderedList' ? node.attrs?.order || 1 : 0;
        return content
          .map((subNode) => {
            const result = _convert(subNode, warnings, { order });
            if (node.type === 'orderedList') {
              order++;
            }
            return result;
          })
          .join('\n');
      }

      case 'listItem': {
        const order = thisContext?.order || 1;
        const symbol = node.attrs?.order ? `${order}.` : '*';
        return `  ${symbol} ${content.map((child) => _convert(child, warnings).trimEnd()).join(' ')}`;
      }

      case 'codeBlock': {
        const language = node.attrs?.language ? ` ${node.attrs.language}` : '';
        return `\`\`\`${language}\n${content.map((child) => _convert(child, warnings)).join('\n')}\n\`\`\``;
      }

      case 'rule':
        return '\n\n---\n';

      case 'emoji':
        return node.attrs?.shortName || '';

      case 'table':
        return content.map((child) => _convert(child, warnings)).join('');

      case 'tableRow': {
        let output = '|';
        let thCount = 0;
        output += content
          .map((subNode) => {
            if (subNode.type === 'tableHeader') {
              thCount++;
            }
            return _convert(subNode, warnings);
          })
          .join('');
        if (thCount) {
          output += `\n${'|:-:'.repeat(thCount)}|\n`;
        }
        return output;
      }

      case 'tableHeader':
      case 'tableCell':
        return `${content.map((child) => _convert(child, warnings)).join('')}|`;

      default:
        warnings.add(node.type);
        return '';
    }
  }

  function _convertMarks(node: Node, warnings: Set<string>): string {
    if (!node.marks || !Array.isArray(node.marks)) {
      return node.text || '';
    }

    return node.marks.reduce((converted, mark) => {
      switch (mark.type) {
        case 'code':
          return `\`${converted}\``;

        case 'em':
          return `_${converted}_`;

        case 'link':
          return `[${converted}](${mark.attrs?.href || '#'})`;

        case 'strike':
          return `~~${converted}~~`;

        case 'strong':
          return `**${converted}**`;

        default:
          warnings.add(mark.type);
          return converted;
      }
    }, node.text || '');
  }

  export function adf2md(adf: ADF): { result: string; warnings: Set<string> } {
    const warnings = new Set<string>();

    validate(adf);

    const result = _convert(adf, warnings);

    return { result, warnings };
  }
  export function parseADF(adfString: string): ADF {
    try {
      const parsed = JSON.parse(adfString);
      validate(parsed); // 验证格式
      return parsed as ADF;
    } catch (error) {
      throw new Error('Invalid ADF format or JSON syntax error.');
    }
  }
  function validate(adf: ADF): void {
    if (!adf || adf.type !== 'doc' || adf.version !== 1) {
      throw new Error('adf-validation-failed');
    }
  }
}
