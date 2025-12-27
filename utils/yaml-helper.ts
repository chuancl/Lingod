
/**
 * Robust YAML Helper for Configuration Management
 * 
 * CORE PRINCIPLE: 
 * To ensure 100% safety with complex strings (like HTML templates in Anki config),
 * all string values are exported using `JSON.stringify()`. 
 * This treats them as JSON-encoded strings within YAML, effectively handling 
 * newlines, quotes, and special characters without complex multiline YAML logic.
 */

interface FieldMetadata {
    key: string;
    comment: string;
    options?: string;
    type?: 'string' | 'boolean' | 'number' | 'array' | 'object';
}

// --------------------------------------------------------------------------------
// METADATA DEFINITIONS (For Comments)
// --------------------------------------------------------------------------------

// 1. General
const generalFields: FieldMetadata[] = [
    { key: 'enabled', comment: '总开关：默认开启翻译', options: 'true | false' },
    { key: 'translateWholePage', comment: '扫描范围：是否扫描整个页面（包括侧边栏等）', options: 'true | false' },
    { key: 'bilingualMode', comment: '双语对照：在段落末尾追加完整中文译文', options: 'true | false' },
    { key: 'aggressiveMode', comment: '激进匹配：启用词典API进行模糊匹配（消耗较大）', options: 'true | false' },
    { key: 'matchInflections', comment: '词态匹配：是否自动识别单词变形', options: 'true | false' },
    { key: 'ttsSpeed', comment: '朗读速度：TTS 播放倍速', options: '0.25 - 3.0' },
    { key: 'blacklist', comment: '黑名单域名列表', type: 'array' },
    { key: 'whitelist', comment: '白名单域名列表', type: 'array' }
];

// 2. Visual Styles
const styleFields: FieldMetadata[] = [
    { key: 'color', comment: '文字颜色 (Hex)', type: 'string' },
    { key: 'backgroundColor', comment: '背景颜色 (Hex)', type: 'string' },
    { key: 'isBold', comment: '是否加粗', options: 'true | false' },
    { key: 'layoutMode', comment: '布局模式', options: 'horizontal | vertical' },
    { key: 'densityMode', comment: '密度模式', options: 'count | percent' },
    { key: 'densityValue', comment: '密度值', type: 'number' },
    { key: 'originalText', comment: '原文样式配置', type: 'object' },
    { key: 'horizontal', comment: '水平布局详细配置', type: 'object' },
    { key: 'vertical', comment: '垂直布局详细配置', type: 'object' }
];

// 3. Scenarios
const scenarioFields: FieldMetadata[] = [
    { key: 'id', comment: '场景 ID', type: 'string' },
    { key: 'name', comment: '场景名称', type: 'string' },
    { key: 'isActive', comment: '是否激活', options: 'true | false' },
];

// 4. Interaction
const interactionFields: FieldMetadata[] = [
    { key: 'bubblePosition', comment: '气泡位置', options: 'top | bottom | left | right' },
    { key: 'autoPronounce', comment: '自动朗读', options: 'true | false' },
    { key: 'mainTrigger', comment: '主触发方式配置', type: 'object' },
    { key: 'quickAddTrigger', comment: '快速添加触发配置', type: 'object' },
    { key: 'onlineDictUrl', comment: '在线词典链接模板', type: 'string' },
];

// 5. Page Widget
const pageWidgetFields: FieldMetadata[] = [
    { key: 'enabled', comment: '启用悬浮球', options: 'true | false' },
    { key: 'showSections', comment: '显示的单词分类 (known/want/learning)', type: 'object' },
    { key: 'cardDisplay', comment: '卡片内容排序与开关', type: 'array' },
    { key: 'showPhonetic', comment: '显示音标', options: 'true | false' },
    { key: 'showMeaning', comment: '显示释义', options: 'true | false' },
    { key: 'modalPosition', comment: '弹窗位置', type: 'object' },
    { key: 'modalSize', comment: '弹窗大小', type: 'object' },
];

// 6. Engines
const engineFields: FieldMetadata[] = [
    { key: 'id', comment: '引擎ID', type: 'string' },
    { key: 'name', comment: '引擎名称', type: 'string' },
    { key: 'type', comment: '类型', options: 'standard | ai' },
    { key: 'isEnabled', comment: '是否启用', options: 'true | false' },
    { key: 'apiKey', comment: 'API Key (已加密/脱敏)', type: 'string' },
    { key: 'isWebSimulation', comment: '是否网页模拟', options: 'true | false' },
];

// 7. Anki
const ankiFields: FieldMetadata[] = [
    { key: 'enabled', comment: '启用集成', options: 'true | false' },
    { key: 'url', comment: 'AnkiConnect 地址', type: 'string' },
    { key: 'deckNameWant', comment: '想学牌组', type: 'string' },
    { key: 'deckNameLearning', comment: '在学牌组', type: 'string' },
    { key: 'templates', comment: '卡片模板 (HTML)', type: 'object' },
    { key: 'syncScope', comment: '同步范围', type: 'object' },
];

// --------------------------------------------------------------------------------
// GENERATOR (EXPORT)
// --------------------------------------------------------------------------------

const indent = (level: number) => '  '.repeat(level);

/**
 * Safely dumps a value to a YAML-compatible string.
 * CRITICAL: Uses JSON.stringify for all strings to handle escaping/newlines perfectly.
 */
const dumpValue = (value: any, level: number): string => {
    if (value === null || value === undefined) return 'null';
    
    // Primitives
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    
    // Strings: Always use JSON.stringify to handle escapes (\n, ", etc.) safely
    // This fixes the issue with broken Anki templates
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }

    // Arrays
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        // Check for simple primitives array (e.g. blacklist)
        if (value.every(v => typeof v !== 'object')) {
            return `[${value.map(v => JSON.stringify(v)).join(', ')}]`;
        }
        // Object array (e.g. Scenarios, Engines)
        let str = '\n';
        value.forEach(item => {
            // Trim start to align dash with indentation
            str += `${indent(level)}- ${dumpObject(item, level + 1, [], true).trimStart()}`;
        });
        return str;
    }

    // Objects
    if (typeof value === 'object') {
        return '\n' + dumpObject(value, level + 1);
    }

    return String(value);
};

const dumpObject = (obj: any, level: number, metadata: FieldMetadata[] = [], isListItem: boolean = false): string => {
    let output = '';
    const keys = Object.keys(obj || {});
    
    keys.forEach((key, index) => {
        const val = obj[key];
        const meta = metadata.find(m => m.key === key);
        
        // Add comment only if exists and not inside a compact list item to avoid clutter
        if (meta && !isListItem) {
            output += `${indent(level)}# ${meta.comment}`;
            if (meta.options) output += ` (${meta.options})`;
            output += '\n';
        }

        // Handle indentation: first item of a list starts with nothing (handled by caller's dash)
        const prefix = (isListItem && index === 0) ? '' : indent(level);
        output += `${prefix}${key}: ${dumpValue(val, level)}\n`;
    });
    return output;
};

export const generateConfigYaml = (fullConfig: any): string => {
    let yaml = `# ContextLingo 配置文件\n# Exported: ${new Date().toLocaleString()}\n`;

    const sections = [
        { key: 'general', title: '1. General Settings', meta: generalFields },
        { key: 'styles', title: '2. Visual Styles', meta: styleFields, isMap: true },
        { key: 'scenarios', title: '3. Scenarios', meta: scenarioFields, isArray: true },
        { key: 'interaction', title: '4. Interaction', meta: interactionFields },
        { key: 'pageWidget', title: '5. Page Widget', meta: pageWidgetFields },
        { key: 'engines', title: '6. Translation Engines', meta: engineFields, isArray: true },
        { key: 'anki', title: '7. Anki Integration', meta: ankiFields }
    ];

    sections.forEach(sec => {
        yaml += `\n# ==================================================\n# ${sec.title}\n# ==================================================\n`;
        const val = fullConfig[sec.key];
        
        if (sec.isMap) {
            // Special case for Styles map
            yaml += `${sec.key}:\n`;
            if (val) {
                Object.keys(val).forEach(subKey => {
                    yaml += `  "${subKey}":\n${dumpObject(val[subKey], 2, sec.meta)}`;
                });
            }
        } else if (sec.isArray) {
            // Arrays (Engines, Scenarios)
            yaml += `${sec.key}:\n`;
            if (Array.isArray(val) && val.length > 0) {
                val.forEach((item: any) => {
                    yaml += `  - ${dumpObject(item, 2, sec.meta, true).trimStart()}`;
                });
            } else {
                yaml += `  []\n`;
            }
        } else {
            // Standard Objects
            yaml += `${sec.key}: ${val ? '\n' + dumpObject(val, 1, sec.meta) : '{}'}\n`;
        }
    });

    return yaml;
};

// --------------------------------------------------------------------------------
// PARSER (IMPORT) - ROBUST IMPLEMENTATION
// --------------------------------------------------------------------------------

export const parseConfigYaml = (yaml: string): any => {
    const lines = yaml.split('\n');
    let currentLine = 0;

    const getLine = () => {
        if (currentLine >= lines.length) return null;
        return lines[currentLine];
    };

    const countIndent = (line: string) => {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    };

    const parseValue = (valStr: string): any => {
        valStr = valStr.trim();
        if (!valStr) return null;
        
        // Remove trailing comments if not inside quotes
        // Simple heuristic: if it contains #, split it, unless it starts with "
        if (!valStr.startsWith('"') && !valStr.startsWith("'")) {
             const commentIdx = valStr.indexOf('#');
             if (commentIdx > -1) valStr = valStr.substring(0, commentIdx).trim();
        }

        // Handle Quoted Strings (JSON compatible)
        if (valStr.startsWith('"') || valStr.startsWith("'")) {
             try {
                 // Normalize single quotes to double for JSON.parse if needed
                 if (valStr.startsWith("'")) valStr = `"${valStr.slice(1, -1).replace(/"/g, '\\"')}"`;
                 
                 // Try to find the end of the JSON string
                 // This is simple; for very complex mixed content it might need a real tokenizer
                 // But since we Export using JSON.stringify, this should match.
                 return JSON.parse(valStr);
             } catch (e) { 
                 // Fallback if parsing fails (e.g. not fully valid JSON)
                 return valStr.replace(/^["']|["']$/g, '');
             }
        }

        if (valStr === 'true') return true;
        if (valStr === 'false') return false;
        if (valStr === 'null') return null;
        if (valStr === '[]') return [];
        if (valStr === '{}') return {};
        
        // Array shorthand: ["a", "b"]
        if (valStr.startsWith('[') && valStr.endsWith(']')) {
            try {
                return JSON.parse(valStr);
            } catch (e) { /* ignore */ }
        }
        
        const num = Number(valStr);
        if (!isNaN(num) && valStr !== '') return num;

        return valStr;
    };

    const parseBlock = (minIndent: number): any => {
        const result: any = {};
        const listResult: any[] = [];
        let isListMode = false;

        while (currentLine < lines.length) {
            const line = getLine();
            if (line === null) break;
            
            // Skip empty/comment lines
            if (!line.trim() || line.trim().startsWith('#')) {
                currentLine++;
                continue;
            }

            const indentLevel = countIndent(line);
            
            // End of block detection
            if (indentLevel < minIndent) {
                break;
            }

            const content = line.trim();
            
            // Array Item: "- key: value" or "- value"
            if (content.startsWith('-')) {
                isListMode = true;
                const valuePart = content.substring(1).trim();
                
                if (!valuePart) {
                    // Object inside list (properties on next lines)
                    currentLine++;
                    listResult.push(parseBlock(indentLevel + 1));
                } else if (valuePart.includes(':') && !valuePart.startsWith('"') && !valuePart.startsWith("'") && !valuePart.startsWith('{')) {
                    // Inline Object definition start: "- key: value"
                    const keyColonIdx = valuePart.indexOf(':');
                    const key = valuePart.substring(0, keyColonIdx).trim();
                    const valStr = valuePart.substring(keyColonIdx + 1).trim();
                    
                    currentLine++; // Consume this line
                    
                    const objItem: any = {};
                    if (valStr) {
                        objItem[key] = parseValue(valStr);
                    } else {
                        objItem[key] = parseBlock(indentLevel + 2);
                    }
                    
                    // Merge with subsequent lines that belong to this item
                    const rest = parseBlock(indentLevel + 1); 
                    Object.assign(objItem, rest);
                    
                    listResult.push(objItem);
                } else {
                    // Primitive array item or JSON object: "- value" or "- { ... }"
                    listResult.push(parseValue(valuePart));
                    currentLine++;
                }
            } 
            // Key-Value Pair: "key: value"
            else if (content.includes(':')) {
                const colonIdx = content.indexOf(':');
                const key = content.substring(0, colonIdx).trim().replace(/['"]/g, ''); // Strip quotes from key
                const valStr = content.substring(colonIdx + 1).trim();
                
                currentLine++;

                if (valStr) {
                    // Value is inline
                    result[key] = parseValue(valStr);
                } else {
                    // Value is a nested block (object or array on next lines)
                    result[key] = parseBlock(indentLevel + 1);
                }
            } else {
                // Unknown format? Skip to avoid infinite loop
                currentLine++;
            }
        }

        return isListMode ? listResult : result;
    };

    return parseBlock(0);
};
