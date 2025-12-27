
export interface VisualStyle {
    color: string;
    backgroundColor: string;
    isBold: boolean;
    isItalic: boolean;
    underlineStyle: 'solid' | 'dashed' | 'dotted' | 'double' | 'wavy' | 'none';
    underlineColor: string;
    underlineOffset: string;
    fontSize: string;
    opacity?: number;
}

/**
 * Converts a StyleConfig-like object into a CSS string.
 * Used for inline styles in Content Script and potentially elsewhere.
 */
export const getStyleStr = (config: VisualStyle): string => {
    // Correctly format text-decoration shorthand: line style color
    // e.g., "underline solid red" or "none"
    const decor = config.underlineStyle !== 'none' 
        ? `underline ${config.underlineStyle} ${config.underlineColor}` 
        : 'none';

    return `
        color: ${config.color};
        background-color: ${config.backgroundColor};
        font-weight: ${config.isBold ? 'bold' : 'normal'};
        font-style: ${config.isItalic ? 'italic' : 'normal'};
        text-decoration: ${decor};
        text-underline-offset: ${config.underlineOffset};
        font-size: ${config.fontSize};
        cursor: pointer;
        line-height: 1.2;
    `.replace(/\s+/g, ' ');
};
