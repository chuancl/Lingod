
import React, { useState } from 'react';
import { WordCategory, StyleConfig, OriginalTextConfig, LayoutSpecificConfig } from '../types';
import { Bold, Italic, MoveHorizontal, MoveVertical, AlignEndHorizontal, Percent, Hash, Info, AlignVerticalJustifyCenter } from 'lucide-react';
import { VisualStyle } from '../utils/style-helper';

const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  return (
    <div className="group relative flex items-center">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
      </div>
    </div>
  );
};

interface VisualStylesSectionProps {
    styles: Record<WordCategory, StyleConfig>;
    onStylesChange: (newStyles: Record<WordCategory, StyleConfig>) => void;
    originalTextConfig: OriginalTextConfig;
    onOriginalTextConfigChange: (newConfig: OriginalTextConfig) => void;
}

export const VisualStylesSection: React.FC<VisualStylesSectionProps> = ({ styles, onStylesChange, originalTextConfig, onOriginalTextConfigChange }) => {
  const [activeTab, setActiveTab] = useState<WordCategory>(Object.values(WordCategory)[0]);

  const currentTranslationStyle = styles[activeTab];

  const updateTranslationStyle = (key: keyof StyleConfig, value: any) => {
    onStylesChange({
      ...styles,
      [activeTab]: {
        ...styles[activeTab],
        [key]: value
      }
    });
  };
  
  // Updates the "Original Text Style" specifically for the active category
  const updateOriginalStyle = (key: keyof VisualStyle, value: any) => {
    onStylesChange({
      ...styles,
      [activeTab]: {
        ...styles[activeTab],
        originalText: {
            ...styles[activeTab].originalText,
            [key]: value
        }
      }
    });
  };

  // Helper to update specific layout config inside the current StyleConfig
  const updateLayoutConfig = (mode: 'horizontal' | 'vertical', field: string, value: any, subField?: string) => {
     // Deep copy the specific mode config to ensure React state updates correctly
     const currentModeConfig = currentTranslationStyle[mode];
     let newModeConfig: LayoutSpecificConfig = { ...currentModeConfig };
     
     if (field === 'wrappers' && subField) {
        const [type, prop] = subField.split('.') as ['translation' | 'original', 'prefix' | 'suffix'];
        
        // Deep copy the wrappers object and the specific wrapper
        newModeConfig.wrappers = {
            ...currentModeConfig.wrappers,
            [type]: {
                ...currentModeConfig.wrappers[type],
                [prop]: value
            }
        };
     } else {
        newModeConfig = { ...newModeConfig, [field]: value };
     }
     
     updateTranslationStyle(mode, newModeConfig);
  };

  // --- Preview Engine ---
  const WordPreview = () => {
    const replacementText = "remember";
    const originalText = "记住";

    // Use current tab's layout settings
    const activeLayoutConfig = currentTranslationStyle.layoutMode === 'horizontal' ? currentTranslationStyle.horizontal : currentTranslationStyle.vertical;
    const isVertical = currentTranslationStyle.layoutMode === 'vertical';
    const baselineTarget = activeLayoutConfig.baselineTarget || 'original';
    const isTransBase = baselineTarget === 'translation';

    // Helper to build styles with overrides for Base alignment
    const getStyle = (config: any, isBase: boolean): React.CSSProperties => {
        // 使用对象展开语法来构建样式
        const baseStyles: React.CSSProperties = {
            color: config.color,
            backgroundColor: config.backgroundColor,
            fontWeight: config.isBold ? 'bold' : 'normal',
            fontStyle: config.isItalic ? 'italic' : 'normal',
            textDecorationLine: config.underlineStyle !== 'none' ? 'underline' : 'none',
            textDecorationStyle: config.underlineStyle !== 'none' ? (config.underlineStyle as any) : undefined,
            textDecorationColor: config.underlineColor,
            textUnderlineOffset: config.underlineOffset,
            fontSize: config.fontSize,
        };

        if (isVertical) {
            if (isBase) {
                return {
                    ...baseStyles,
                    lineHeight: 'normal',
                    verticalAlign: 'baseline',
                };
            } else {
                return {
                    ...baseStyles,
                    lineHeight: '1',
                };
            }
        }

        return baseStyles;
    };

    // Wrappers
    const transPrefix = activeLayoutConfig.wrappers.translation.prefix;
    const transSuffix = activeLayoutConfig.wrappers.translation.suffix;
    const origPrefix = activeLayoutConfig.wrappers.original.prefix;
    const origSuffix = activeLayoutConfig.wrappers.original.suffix;

    // Element Building
    const TransComponent = (
        <span style={getStyle(currentTranslationStyle, isTransBase)} className="whitespace-nowrap border-b-2 border-transparent hover:border-blue-200 transition-colors">
            {transPrefix}{replacementText}{transSuffix}
        </span>
    );

    // Read original style from the current category config
    const OrigComponent = (
        <span style={getStyle(currentTranslationStyle.originalText, !isTransBase)} className="whitespace-nowrap">
            {origPrefix}{originalText}{origSuffix}
        </span>
    );

    if (!originalTextConfig.show) {
       return (
        <div className="text-lg text-slate-500 flex flex-col items-center justify-center min-h-[140px] leading-relaxed">
            <div className="flex items-baseline flex-wrap justify-center">
                <span className="mr-1">每次网上冲浪时，我都能</span>
                {TransComponent}
                <span className="ml-1">更多的单词。</span>
            </div>
        </div>
       );
    }

    let content;
    const { translationFirst } = activeLayoutConfig;

    if (currentTranslationStyle.layoutMode === 'horizontal') {
        content = (
            <span className="inline items-baseline">
                {translationFirst ? TransComponent : OrigComponent}
                {translationFirst ? OrigComponent : TransComponent}
            </span>
        );
    } else {
        // Vertical Layout using <ruby>
        const BaseComp = isTransBase ? TransComponent : OrigComponent;
        const RtComp = isTransBase ? OrigComponent : TransComponent;
        
        let rubyPosition: 'over' | 'under' = 'over';
        
        if (translationFirst) {
            if (isTransBase) rubyPosition = 'under';
            else rubyPosition = 'over';
        } else {
            if (isTransBase) rubyPosition = 'over';
            else rubyPosition = 'under';
        }

        content = (
           <ruby style={{ rubyPosition, margin: '0', rubyAlign: 'start', textAlign: 'left' } as any}>
              {BaseComp}
              <rt style={{ fontFamily: 'inherit', fontSize: '100%' }}>{RtComp}</rt>
           </ruby>
        );
    }

    return (
       <div className="text-lg text-slate-500 flex flex-col items-center justify-center min-h-[140px]">
          <div className="text-center leading-loose">
             <span>每次网上冲浪时，我都能</span>
             {content}
             <span className="ml-1">更多的单词。</span>
          </div>
       </div>
    );
  };

  const StyleControls = ({ config, onChange }: { config: any, onChange: (k: string, v: any) => void }) => (
      <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="text-xs text-slate-500 block mb-1">文字颜色</label>
                <div className="flex items-center space-x-2">
                    <input type="color" value={config.color} onChange={(e) => onChange('color', e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
                </div>
            </div>
            <div>
                <label className="text-xs text-slate-500 block mb-1">背景颜色</label>
                <div className="flex items-center space-x-2">
                    <input type="color" value={config.backgroundColor} onChange={(e) => onChange('backgroundColor', e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
                </div>
            </div>
          </div>
          <div className="flex space-x-2">
            <button onClick={() => onChange('isBold', !config.isBold)} className={`flex-1 py-1.5 rounded border flex items-center justify-center text-xs ${config.isBold ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white text-slate-600'}`}>
                <Bold className="w-3 h-3 mr-2" /> 加粗
            </button>
            <button onClick={() => onChange('isItalic', !config.isItalic)} className={`flex-1 py-1.5 rounded border flex items-center justify-center text-xs ${config.isItalic ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white text-slate-600'}`}>
                <Italic className="w-3 h-3 mr-2" /> 斜体
            </button>
          </div>
          
          <div className="pt-2 border-t border-slate-100 mt-2">
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="text-xs text-slate-500 block mb-1">下划线样式</label>
                      <select value={config.underlineStyle} onChange={(e) => onChange('underlineStyle', e.target.value)} className="w-full text-xs border-slate-300 rounded">
                          <option value="none">无</option>
                          <option value="solid">实线</option>
                          <option value="dashed">虚线</option>
                          <option value="dotted">点线</option>
                          <option value="double">双线</option>
                          <option value="wavy">波浪线</option>
                      </select>
                  </div>
                  <div>
                      <label className="text-xs text-slate-500 block mb-1">下划线颜色</label>
                      <div className="flex items-center space-x-2">
                          <input 
                            type="color" 
                            value={config.underlineColor === 'transparent' ? '#000000' : config.underlineColor} 
                            onChange={(e) => onChange('underlineColor', e.target.value)} 
                            className="w-8 h-8 rounded border cursor-pointer" 
                            disabled={config.underlineStyle === 'none'}
                          />
                      </div>
                  </div>
              </div>
          </div>
          <div>
              <label className="text-xs text-slate-500 block mb-1">下划线偏移 ({config.underlineOffset})</label>
              <input type="range" min="0" max="8" value={parseInt(config.underlineOffset)} onChange={(e) => onChange('underlineOffset', `${e.target.value}px`)} className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer" />
          </div>
          
           <div>
              <label className="text-xs text-slate-500 block mb-1">字号 ({config.fontSize})</label>
               <select value={config.fontSize} onChange={(e) => onChange('fontSize', e.target.value)} className="w-full text-xs border-slate-300 rounded">
                  <option value="0.5em">极小 (0.5em)</option>
                  <option value="0.6em">超小 (0.6em)</option>
                  <option value="0.75em">小 (0.75em)</option>
                  <option value="0.85em">较小 (0.85em)</option>
                  <option value="0.9em">微小 (0.9em)</option>
                  <option value="1em">正常 (1em)</option>
                  <option value="1.1em">较大 (1.1em)</option>
                  <option value="1.25em">大 (1.25em)</option>
                  <option value="1.5em">加大 (1.5em)</option>
                  <option value="1.75em">超大 (1.75em)</option>
                  <option value="2em">极大 (2em)</option>
              </select>
          </div>
      </div>
  );

  const WrapperInput = ({ value, onChange, placeholder = "" }: { value: string, onChange: (v: string) => void, placeholder?: string }) => (
      <input 
         type="text" 
         value={value} 
         onChange={e => onChange(e.target.value)}
         placeholder={placeholder}
         className="w-8 h-8 p-0 text-center text-xs border border-slate-200 rounded bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition-all placeholder:text-slate-300"
      />
  );

  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-800">译文样式配置</h2>
        <p className="text-sm text-slate-500 mt-1">为不同类型的词汇独立配置视觉效果、布局及替换频率。</p>
      </div>
      
      {/* Tabs */}
      <div className="border-b border-slate-200 px-6 py-4 bg-white flex gap-2 overflow-x-auto hide-scrollbar">
         {Object.values(WordCategory).map(cat => (
             <button
               key={cat}
               onClick={() => setActiveTab(cat)}
               className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-all flex items-center ${
                 activeTab === cat 
                   ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
                   : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
               }`}
             >
               {cat}
             </button>
           ))}
      </div>

      <div className="p-8 space-y-8">
           {/* Preview Section */}
           <div>
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">实时预览 ({activeTab})</h3>
             <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 flex justify-center items-center min-h-[180px]">
                <WordPreview />
             </div>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-12">
              {/* Left Column: Translation Style */}
              <div>
                 <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                    译文样式配置 (Translation)
                 </h4>
                 <StyleControls config={currentTranslationStyle} onChange={updateTranslationStyle} />
              </div>

              {/* Right Column: Original Text & Layout */}
              <div>
                 <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-4">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center">
                       <span className={`w-2 h-2 rounded-full mr-2 ${originalTextConfig.show ? 'bg-purple-500' : 'bg-slate-300'}`}></span>
                       原文样式配置 (Original)
                    </h4>
                    <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={originalTextConfig.show} 
                            onChange={() => onOriginalTextConfigChange({...originalTextConfig, show: !originalTextConfig.show})}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                 </div>
                 
                 {originalTextConfig.show ? (
                     <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                        {/* Now using the per-category original text style */}
                        <StyleControls config={currentTranslationStyle.originalText} onChange={updateOriginalStyle} />
                     </div>
                 ) : (
                    <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 rounded-lg border border-dashed border-slate-200">
                       原文已隐藏，仅显示译文
                    </div>
                 )}
              </div>
           </div>

           {/* Full Width: Layout & Wrapping Symbols */}
           {originalTextConfig.show && (
             <div className="pt-6 border-t border-slate-100">
               <h4 className="text-sm font-bold text-slate-900 mb-4">原文布局与包裹符号 ({activeTab})</h4>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 
                 {/* Horizontal Card */}
                 <div 
                    onClick={() => updateTranslationStyle('layoutMode', 'horizontal')}
                    className={`relative border-2 rounded-xl p-5 cursor-pointer transition-all ${currentTranslationStyle.layoutMode === 'horizontal' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 hover:border-blue-200 bg-white'}`}
                 >
                    <div className="flex items-center justify-between mb-4">
                       <div className="flex items-center">
                          <input type="radio" checked={currentTranslationStyle.layoutMode === 'horizontal'} readOnly className="text-blue-600 mr-2"/>
                          <span className="font-bold text-sm text-slate-700 flex items-center"><MoveHorizontal className="w-4 h-4 mr-1.5"/> 左右并排 (Horizontal)</span>
                       </div>
                    </div>
                    
                    {/* Horizontal Builder */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-center overflow-x-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center">
                           <WrapperInput 
                             value={currentTranslationStyle.horizontal.translationFirst ? currentTranslationStyle.horizontal.wrappers.translation.prefix : currentTranslationStyle.horizontal.wrappers.original.prefix}
                             onChange={v => updateLayoutConfig('horizontal', 'wrappers', v, currentTranslationStyle.horizontal.translationFirst ? 'translation.prefix' : 'original.prefix')}
                             placeholder={currentTranslationStyle.horizontal.translationFirst ? "" : "("}
                           />
                           
                           <select 
                             value={currentTranslationStyle.horizontal.translationFirst ? 'translation' : 'original'}
                             onChange={e => updateLayoutConfig('horizontal', 'translationFirst', e.target.value === 'translation')}
                             className="text-xs py-1 px-2 border-slate-200 bg-slate-50 rounded min-w-[60px] mx-1"
                           >
                              <option value="translation">译文</option>
                              <option value="original">原文</option>
                           </select>

                           <WrapperInput 
                             value={currentTranslationStyle.horizontal.translationFirst ? currentTranslationStyle.horizontal.wrappers.translation.suffix : currentTranslationStyle.horizontal.wrappers.original.suffix}
                             onChange={v => updateLayoutConfig('horizontal', 'wrappers', v, currentTranslationStyle.horizontal.translationFirst ? 'translation.suffix' : 'original.suffix')}
                             placeholder={currentTranslationStyle.horizontal.translationFirst ? "" : ")"}
                           />
                        </div>
                        
                        <span className="text-slate-300 mx-2">|</span>

                        <div className="flex items-center">
                           <WrapperInput 
                             value={currentTranslationStyle.horizontal.translationFirst ? currentTranslationStyle.horizontal.wrappers.original.prefix : currentTranslationStyle.horizontal.wrappers.translation.prefix}
                             onChange={v => updateLayoutConfig('horizontal', 'wrappers', v, currentTranslationStyle.horizontal.translationFirst ? 'original.prefix' : 'translation.prefix')}
                             placeholder={currentTranslationStyle.horizontal.translationFirst ? "(" : ""}
                           />
                           
                           <div className="text-xs py-1.5 px-3 bg-slate-100 text-slate-500 rounded border border-slate-200 min-w-[60px] text-center select-none mx-1">
                              {currentTranslationStyle.horizontal.translationFirst ? '原文' : '译文'}
                           </div>

                           <WrapperInput 
                             value={currentTranslationStyle.horizontal.translationFirst ? currentTranslationStyle.horizontal.wrappers.original.suffix : currentTranslationStyle.horizontal.wrappers.translation.suffix}
                             onChange={v => updateLayoutConfig('horizontal', 'wrappers', v, currentTranslationStyle.horizontal.translationFirst ? 'original.suffix' : 'translation.suffix')}
                             placeholder={currentTranslationStyle.horizontal.translationFirst ? ")" : ""}
                           />
                        </div>
                    </div>
                 </div>

                 {/* Vertical Card */}
                 <div 
                    onClick={() => updateTranslationStyle('layoutMode', 'vertical')}
                    className={`relative border-2 rounded-xl p-5 cursor-pointer transition-all ${currentTranslationStyle.layoutMode === 'vertical' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 hover:border-blue-200 bg-white'}`}
                 >
                    <div className="flex items-center justify-between mb-4">
                       <div className="flex items-center">
                          <input type="radio" checked={currentTranslationStyle.layoutMode === 'vertical'} readOnly className="text-blue-600 mr-2"/>
                          <span className="font-bold text-sm text-slate-700 flex items-center"><MoveVertical className="w-4 h-4 mr-1.5"/> 上下堆叠 (Vertical)</span>
                       </div>
                    </div>

                    {/* Vertical Builder */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                         <div className="flex items-center justify-center gap-3">
                            <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400 w-8 text-right">Top</span>
                                    <WrapperInput 
                                        value={currentTranslationStyle.vertical.translationFirst ? currentTranslationStyle.vertical.wrappers.translation.prefix : currentTranslationStyle.vertical.wrappers.original.prefix}
                                        onChange={v => updateLayoutConfig('vertical', 'wrappers', v, currentTranslationStyle.vertical.translationFirst ? 'translation.prefix' : 'original.prefix')}
                                    />
                                    <select 
                                        value={currentTranslationStyle.vertical.translationFirst ? 'translation' : 'original'}
                                        onChange={e => updateLayoutConfig('vertical', 'translationFirst', e.target.value === 'translation')}
                                        className="text-xs py-1 px-2 border-slate-200 bg-slate-50 rounded min-w-[70px]"
                                    >
                                        <option value="translation">译文(上)</option>
                                        <option value="original">原文(上)</option>
                                    </select>
                                    <WrapperInput 
                                        value={currentTranslationStyle.vertical.translationFirst ? currentTranslationStyle.vertical.wrappers.translation.suffix : currentTranslationStyle.vertical.wrappers.original.suffix}
                                        onChange={v => updateLayoutConfig('vertical', 'wrappers', v, currentTranslationStyle.vertical.translationFirst ? 'translation.suffix' : 'original.suffix')}
                                    />
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400 w-8 text-right">Bottom</span>
                                    <WrapperInput 
                                        value={currentTranslationStyle.vertical.translationFirst ? currentTranslationStyle.vertical.wrappers.original.prefix : currentTranslationStyle.vertical.wrappers.translation.prefix}
                                        onChange={v => updateLayoutConfig('vertical', 'wrappers', v, currentTranslationStyle.vertical.translationFirst ? 'original.prefix' : 'translation.prefix')}
                                    />
                                    <div className="text-xs py-1.5 px-3 bg-slate-100 text-slate-500 rounded border border-slate-200 min-w-[70px] text-center select-none">
                                        {currentTranslationStyle.vertical.translationFirst ? '原文(下)' : '译文(下)'}
                                    </div>
                                    <WrapperInput 
                                        value={currentTranslationStyle.vertical.translationFirst ? currentTranslationStyle.vertical.wrappers.original.suffix : currentTranslationStyle.vertical.wrappers.translation.suffix}
                                        onChange={v => updateLayoutConfig('vertical', 'wrappers', v, currentTranslationStyle.vertical.translationFirst ? 'original.suffix' : 'translation.suffix')}
                                    />
                                </div>
                            </div>
                         </div>
                         
                         <div className="border-t border-slate-100 pt-3">
                            <div className="flex items-center gap-2 mb-2">
                               <AlignVerticalJustifyCenter className="w-3 h-3 text-slate-400" />
                               <span className="text-xs font-bold text-slate-500">对齐基准 (ALIGNMENT TARGET)</span>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                 onClick={() => updateLayoutConfig('vertical', 'baselineTarget', 'original')}
                                 className={`flex-1 py-1.5 text-xs rounded border transition-colors ${currentTranslationStyle.vertical.baselineTarget !== 'translation' ? 'bg-blue-50 border-blue-200 text-blue-600 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                               >
                                 原文保持齐平
                               </button>
                               <button 
                                 onClick={() => updateLayoutConfig('vertical', 'baselineTarget', 'translation')}
                                 className={`flex-1 py-1.5 text-xs rounded border transition-colors ${currentTranslationStyle.vertical.baselineTarget === 'translation' ? 'bg-blue-50 border-blue-200 text-blue-600 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                               >
                                 译文保持齐平
                               </button>
                            </div>
                         </div>
                    </div>
                 </div>

               </div>
             </div>
           )}

           {/* Density Configuration */}
           <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-6">
                 <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                    <AlignEndHorizontal className="w-3 h-3" />
                 </div>
                 <h4 className="text-sm font-bold text-slate-800">
                    替换密度配置 ({activeTab})
                 </h4>
                 <Tooltip text="控制当前类型单词在页面上的替换频率。设置对每个段落生效（例如每段最多替换3个）。">
                    <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                 </Tooltip>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row items-center gap-8">
                  {/* Toggle Mode */}
                  <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm shrink-0">
                      <button 
                         onClick={() => updateTranslationStyle('densityMode', 'count')}
                         className={`flex items-center px-4 py-2 rounded-md text-sm transition-all ${currentTranslationStyle.densityMode === 'count' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                         <Hash className="w-4 h-4 mr-2" /> 按个数 (Count)
                      </button>
                      <button 
                         onClick={() => updateTranslationStyle('densityMode', 'percent')}
                         className={`flex items-center px-4 py-2 rounded-md text-sm transition-all ${currentTranslationStyle.densityMode === 'percent' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                         <Percent className="w-4 h-4 mr-2" /> 按百分比 (%)
                      </button>
                  </div>

                  {/* Slider & Input */}
                  <div className="flex-1 w-full flex items-center gap-4">
                      <div className="flex-1 relative h-6 flex items-center">
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 rounded-full" 
                                style={{width: `${currentTranslationStyle.densityMode === 'percent' ? currentTranslationStyle.densityValue : Math.min(100, (currentTranslationStyle.densityValue / 50) * 100)}%`}}
                              ></div>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max={currentTranslationStyle.densityMode === 'percent' ? 100 : 50} 
                            step="1"
                            value={currentTranslationStyle.densityValue}
                            onChange={(e) => updateTranslationStyle('densityValue', parseInt(e.target.value))}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div 
                             className="absolute w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow pointer-events-none transition-all"
                             style={{left: `${currentTranslationStyle.densityMode === 'percent' ? currentTranslationStyle.densityValue : Math.min(100, (currentTranslationStyle.densityValue / 50) * 100)}%`, transform: 'translateX(-50%)'}}
                          ></div>
                      </div>
                      
                      <div className="flex items-center border border-slate-200 rounded-lg bg-white px-3 py-1.5 min-w-[80px]">
                          <input 
                            type="number" 
                            value={currentTranslationStyle.densityValue}
                            onChange={(e) => updateTranslationStyle('densityValue', Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full text-right font-bold text-slate-700 outline-none text-sm mr-1"
                          />
                          <span className="text-xs text-slate-400 font-medium">
                              {currentTranslationStyle.densityMode === 'percent' ? '%' : '个'}
                          </span>
                      </div>
                  </div>
              </div>
           </div>
      </div>
    </section>
  );
};
