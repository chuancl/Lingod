
import React, { useRef } from 'react';
import { FileJson, UploadCloud, DownloadCloud, AlertTriangle, FileCheck, RefreshCw } from 'lucide-react';
import { generateConfigYaml, parseConfigYaml } from '../../utils/yaml-helper';
import { Toast, ToastMessage } from '../ui/Toast';

interface ConfigManagementSectionProps {
    currentConfigs: any;
    onImport: (newConfigs: any) => Promise<void>;
}

export const ConfigManagementSection: React.FC<ConfigManagementSectionProps> = ({ currentConfigs, onImport }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [toast, setToast] = React.useState<ToastMessage | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
        setToast({ id: Date.now(), message, type });
    };

    const handleExport = () => {
        try {
            const yamlContent = generateConfigYaml(currentConfigs);
            const blob = new Blob([yamlContent], { type: 'text/yaml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reword_config_${new Date().toISOString().split('T')[0]}.yaml`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('配置导出成功', 'success');
        } catch (e: any) {
            showToast(`导出失败: ${e.message}`, 'error');
        }
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string;
                const parsed = parseConfigYaml(text);
                
                // Basic Validation
                if (!parsed || typeof parsed !== 'object') {
                    throw new Error("无效的配置文件格式");
                }

                // Check for at least one major key to confirm it's likely our config
                const validKeys = ['general', 'styles', 'scenarios', 'engines'];
                const hasValidKey = Object.keys(parsed).some(k => validKeys.includes(k));
                
                if (!hasValidKey) {
                    throw new Error("无法识别的配置文件结构");
                }

                if (confirm('导入配置将覆盖当前的所有设置（不含词汇数据），确定继续吗？')) {
                    await onImport(parsed);
                    showToast('配置导入成功！页面将刷新以应用更改。', 'success');
                    // Reload to ensure all components re-mount with new config
                    setTimeout(() => window.location.reload(), 1000);
                }
            } catch (err: any) {
                console.error(err);
                showToast(`导入失败: ${err.message}`, 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    };

    return (
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <Toast toast={toast} onClose={() => setToast(null)} />
            
            <div className="p-6 border-b border-slate-200 bg-slate-50/50">
                <h2 className="text-lg font-bold text-slate-800 flex items-center">
                    <FileJson className="w-5 h-5 mr-2 text-blue-600"/>
                    配置数据管理
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                    导入或导出插件的全局配置数据（不包含单词库）。配置文件使用 YAML 格式，方便备份与分享。
                </p>
            </div>

            <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Export Card */}
                    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center text-center hover:border-blue-300 transition-all group shadow-sm">
                        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                            <DownloadCloud className="w-8 h-8 text-blue-600" />
                        </div>
                        <h3 className="text-base font-bold text-slate-800 mb-2">备份当前配置</h3>
                        <p className="text-xs text-slate-500 mb-6 leading-relaxed max-w-[200px]">
                            生成包含当前所有设置项的 YAML 文件。文件内包含详细注释，方便您阅读和手动微调。
                        </p>
                        <button 
                            onClick={handleExport}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm flex items-center justify-center"
                        >
                            <FileCheck className="w-4 h-4 mr-2" />
                            导出配置
                        </button>
                    </div>

                    {/* Import Card */}
                    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center text-center hover:border-amber-300 transition-all group shadow-sm relative overflow-hidden">
                        {/* Warning Stripe */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-amber-400"></div>
                        
                        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-amber-100 transition-colors">
                            <UploadCloud className="w-8 h-8 text-amber-600" />
                        </div>
                        <h3 className="text-base font-bold text-slate-800 mb-2">恢复/导入配置</h3>
                        <p className="text-xs text-slate-500 mb-6 leading-relaxed max-w-[200px]">
                            加载 YAML 配置文件以还原设置。
                            <br/>
                            <span className="text-amber-600 font-medium">注意：此操作将覆盖当前的全局设置。</span>
                        </p>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-2.5 bg-white border border-slate-300 hover:border-amber-400 hover:text-amber-700 text-slate-700 rounded-lg text-sm font-medium transition shadow-sm flex items-center justify-center"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            选择文件导入
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".yaml,.yml" 
                            onChange={handleImportFile}
                        />
                    </div>
                </div>

                <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-500 leading-relaxed">
                        <span className="font-bold text-slate-700">说明：</span>
                        配置管理仅涉及插件的功能设置（如翻译引擎 Key、样式规则、交互习惯等）。
                        <br/>
                        您的词汇数据（单词、释义、例句等）请在“词汇管理”页面进行导入/导出操作。
                    </div>
                </div>
            </div>
        </section>
    );
};
