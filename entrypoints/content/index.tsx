import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { defineContentScript } from 'wxt/sandbox';
import { createShadowRootUi } from 'wxt/client';
import { PageWidget } from '../../components/PageWidget';
import { WordBubble } from '../../components/WordBubble';
import { 
    entriesStorage, 
    pageWidgetConfigStorage, 
    autoTranslateConfigStorage, 
    stylesStorage, 
    originalTextConfigStorage, 
    interactionConfigStorage 
} from '../../utils/storage';
import { 
    WordEntry, 
    PageWidgetConfig, 
    WordInteractionConfig, 
    AutoTranslateConfig, 
    WordCategory,
    StyleConfig,
    OriginalTextConfig
} from '../../types';
import { findFuzzyMatches } from '../../utils/matching';
import { buildReplacementHtml } from '../../utils/dom-builder';
import '../../index.css';

interface ContentOverlayProps {
    initialWidgetConfig: PageWidgetConfig;
    initialEntries: WordEntry[];
    initialInteractionConfig: WordInteractionConfig;
    initialAutoTranslateConfig: AutoTranslateConfig;
    initialStyles: Record<WordCategory, StyleConfig>;
    initialOriginalTextConfig: OriginalTextConfig;
}

interface ActiveBubble {
    id: string;
    entry: WordEntry;
    targetRect: DOMRect;
    originalText: string;
    context?: {
        sentence?: string;
        sentenceTrans?: string;
        paragraph?: string;
        paragraphTrans?: string;
        sourceUrl?: string;
    };
}

const ContentOverlay: React.FC<ContentOverlayProps> = ({ 
    initialWidgetConfig, 
    initialEntries, 
    initialInteractionConfig,
    initialAutoTranslateConfig,
    initialStyles,
    initialOriginalTextConfig
}) => {
    // Config State
    const [widgetConfig, setWidgetConfig] = useState<PageWidgetConfig>(initialWidgetConfig);
    const [entries, setEntries] = useState<WordEntry[]>(initialEntries);
    const [interactionConfig, setInteractionConfig] = useState<WordInteractionConfig>(initialInteractionConfig);
    const [autoTranslateConfig, setAutoTranslateConfig] = useState<AutoTranslateConfig>(initialAutoTranslateConfig);
    const [styles, setStyles] = useState<Record<WordCategory, StyleConfig>>(initialStyles);
    const [originalTextConfig, setOriginalTextConfig] = useState<OriginalTextConfig>(initialOriginalTextConfig);

    // Runtime State
    const [pageWords, setPageWords] = useState<WordEntry[]>([]);
    const [activeBubbles, setActiveBubbles] = useState<ActiveBubble[]>([]);
    const [foundContexts, setFoundContexts] = useState<Record<string, Partial<WordEntry>>>({});

    // Scan Logic (Simplified for compilation fix)
    const scanPage = useCallback(() => {
        if (!autoTranslateConfig.enabled) return;
        
        // This is a placeholder for the actual DOM scanning and replacement logic
        // In a real implementation, you would traverse the DOM, find text nodes, 
        // use findFuzzyMatches, and replace text with HTML spans.
        // For now, we simulate finding words to populate the widget.
        
        const textContent = document.body.innerText;
        const matches = findFuzzyMatches(textContent, entries);
        
        // De-duplicate matches for pageWords list
        const uniqueFound: WordEntry[] = [];
        const seenIds = new Set<string>();
        const newContexts: Record<string, Partial<WordEntry>> = {};

        matches.forEach(m => {
            if (!seenIds.has(m.entry.id)) {
                seenIds.add(m.entry.id);
                uniqueFound.push(m.entry);
            }
            // Mock context capture
            newContexts[m.entry.id] = {
                contextSentence: m.text, // Just the matched text as sentence for now
                sourceUrl: window.location.href
            };
        });

        setPageWords(uniqueFound);
        setFoundContexts(newContexts);
    }, [entries, autoTranslateConfig.enabled]);

    useEffect(() => {
        // Initial scan
        const timer = setTimeout(scanPage, 1000);
        return () => clearTimeout(timer);
    }, [scanPage]);

    // Handle bubble trigger from Light DOM events
    useEffect(() => {
        const handleInteraction = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Check if the target is one of our replacement spans (needs class 'context-lingo-target')
            if (target && target.classList.contains('context-lingo-target')) {
                const entryId = target.getAttribute('data-entry-id');
                if (entryId) {
                    const entry = entries.find(en => en.id === entryId);
                    if (entry) {
                        const rect = target.getBoundingClientRect();
                        setActiveBubbles([{
                            id: entryId,
                            entry,
                            targetRect: rect,
                            originalText: target.getAttribute('data-original-text') || '',
                            context: {
                                sentence: target.getAttribute('data-ctx-s') || '',
                                sentenceTrans: target.getAttribute('data-ctx-st') || '',
                                sourceUrl: window.location.href
                            }
                        }]);
                    }
                }
            } else {
                // Click outside to close bubble
                if (activeBubbles.length > 0 && !widgetConfig.enabled) { // Logic simplification
                     setActiveBubbles([]);
                }
            }
        };

        // For hover trigger
        if (interactionConfig.mainTrigger.action === 'Hover') {
            document.addEventListener('mouseover', handleInteraction);
        } else {
            document.addEventListener('click', handleInteraction);
        }

        return () => {
            document.removeEventListener('mouseover', handleInteraction);
            document.removeEventListener('click', handleInteraction);
        };
    }, [entries, interactionConfig, activeBubbles, widgetConfig.enabled]);

    const handleCaptureAndAdd = async (id: string) => {
        const entry = entries.find(e => e.id === id);
        if (entry) {
            // Update category to Learning
            const updatedEntry = { ...entry, category: WordCategory.LearningWord };
            const newEntries = entries.map(e => e.id === id ? updatedEntry : e);
            setEntries(newEntries);
            await entriesStorage.setValue(newEntries);
        }
    };

    const handleUpdateCategory = async (id: string, updates: Partial<WordEntry>) => {
        const newEntries = entries.map(e => e.id === id ? { ...e, ...updates } : e);
        setEntries(newEntries);
        await entriesStorage.setValue(newEntries);
    };

    // Merge static entries with dynamically captured context
    const enrichedPageWords = pageWords.map(pw => ({
        ...pw,
        ...(foundContexts[pw.id] || {})
    }));

    return (
        <div className="reset-shadow-dom" style={{ all: 'initial', fontFamily: 'sans-serif' }}>
            <PageWidget 
                config={widgetConfig} 
                setConfig={(v) => {
                    setWidgetConfig(v);
                    pageWidgetConfigStorage.setValue(v);
                }} 
                pageWords={enrichedPageWords} 
                setPageWords={setPageWords} 
                onBatchAddToLearning={(ids) => ids.forEach(id => handleCaptureAndAdd(id))} 
            />
            
            {activeBubbles.map(bubble => (
                <WordBubble 
                    key={bubble.id}
                    entry={bubble.entry}
                    originalText={bubble.originalText}
                    targetRect={bubble.targetRect}
                    config={interactionConfig}
                    isVisible={true}
                    onMouseEnter={() => {}}
                    onMouseLeave={() => setActiveBubbles([])}
                    onUpdateCategory={handleUpdateCategory}
                    context={bubble.context}
                />
            ))}
        </div>
    );
};

export default defineContentScript({
    matches: ['<all_urls>'],
    cssInjectionMode: 'ui',
    async main(ctx) {
        const [
            initialWidgetConfig, 
            initialEntries, 
            initialInteractionConfig, 
            initialAutoTranslateConfig,
            initialStyles,
            initialOriginalTextConfig
        ] = await Promise.all([
            pageWidgetConfigStorage.getValue(),
            entriesStorage.getValue(),
            interactionConfigStorage.getValue(),
            autoTranslateConfigStorage.getValue(),
            stylesStorage.getValue(),
            originalTextConfigStorage.getValue()
        ]);

        const ui = await createShadowRootUi(ctx, {
            name: 'context-lingo-ui',
            position: 'overlay',
            onMount: (container) => {
                const root = ReactDOM.createRoot(container);
                root.render(
                    <ContentOverlay 
                        initialWidgetConfig={initialWidgetConfig}
                        initialEntries={initialEntries}
                        initialInteractionConfig={initialInteractionConfig}
                        initialAutoTranslateConfig={initialAutoTranslateConfig}
                        initialStyles={initialStyles}
                        initialOriginalTextConfig={initialOriginalTextConfig}
                    />
                );
                return root;
            },
            onRemove: (root) => {
                root?.unmount();
            },
        });

        ui.mount();
    },
});
