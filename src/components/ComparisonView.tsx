import { useState } from 'react';
import { X, ArrowLeftRight, Download, Eye } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface ComparisonViewProps {
  blocks: any[];
  onClose: () => void;
  onViewBlock: (block: any) => void;
}

export function ComparisonView({ blocks, onClose, onViewBlock }: ComparisonViewProps) {
  const [selectedBlocks, setSelectedBlocks] = useState<any[]>(blocks.slice(0, 2));

  const compareProperties = (block1: any, block2: any) => {
    const props1 = {
      name: block1?.title || block1?.name || 'N/A',
      category: block1?.category || 'N/A',
      lastModified: block1?.lastModified ? new Date(block1.lastModified).toLocaleDateString() : 'N/A',
      pathSet: block1?.pathSet ? 'Yes' : 'No',
      color: block1?.color || 'N/A',
    };

    const props2 = {
      name: block2?.title || block2?.name || 'N/A',
      category: block2?.category || 'N/A',
      lastModified: block2?.lastModified ? new Date(block2.lastModified).toLocaleDateString() : 'N/A',
      pathSet: block2?.pathSet ? 'Yes' : 'No',
      color: block2?.color || 'N/A',
    };

    return { props1, props2 };
  };

  const { props1, props2 } = compareProperties(selectedBlocks[0], selectedBlocks[1]);

  const PropertyRow = ({ label, value1, value2 }: { label: string; value1: string; value2: string }) => {
    const isDifferent = value1 !== value2;
    return (
      <div className={`grid grid-cols-3 gap-4 py-3 border-b border-slate-700/50 dark:border-blue-500/20 ${isDifferent ? 'bg-amber-500/10' : ''}`}>
        <div className="font-semibold text-slate-700 dark:text-blue-200">{label}</div>
        <div className="text-slate-600 dark:text-blue-100">{value1}</div>
        <div className="text-slate-600 dark:text-blue-100">{value2}</div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-blue-500/30 rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="bg-slate-100 dark:bg-slate-800/50 border-b border-slate-300 dark:border-blue-500/30 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArrowLeftRight className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-blue-50">Block Comparison</h2>
          </div>
          <Tooltip content="Close comparison">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-blue-500/40 flex items-center justify-center text-slate-700 dark:text-blue-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {selectedBlocks.map((block, idx) => (
              <div
                key={idx}
                className="bg-slate-50 dark:bg-slate-800/40 border-2 border-slate-300 dark:border-blue-500/30 rounded-2xl p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{ backgroundColor: block?.color || '#4a9eff' }}
                    >
                      {block?.icon || '📦'}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-blue-50">
                        {block?.title || block?.name || 'Block ' + (idx + 1)}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-blue-200/70">{block?.category || 'Unknown'}</p>
                    </div>
                  </div>
                  <Tooltip content="View in 3D">
                    <button
                      onClick={() => onViewBlock(block)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                  </Tooltip>
                </div>
                <div className="w-full h-48 bg-slate-200 dark:bg-slate-900/50 rounded-xl flex items-center justify-center border border-slate-300 dark:border-blue-500/20">
                  <span className="text-4xl">{block?.icon || '📦'}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-300 dark:border-blue-500/30 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-slate-800 dark:text-blue-50 mb-4">Property Comparison</h3>
            <div className="space-y-1">
              <div className="grid grid-cols-3 gap-4 py-3 border-b-2 border-slate-300 dark:border-blue-500/40 font-bold text-slate-800 dark:text-blue-100">
                <div>Property</div>
                <div>Block 1</div>
                <div>Block 2</div>
              </div>
              <PropertyRow label="Name" value1={props1.name} value2={props2.name} />
              <PropertyRow label="Category" value1={props1.category} value2={props2.category} />
              <PropertyRow label="Last Modified" value1={props1.lastModified} value2={props2.lastModified} />
              <PropertyRow label="Path Set" value1={props1.pathSet} value2={props2.pathSet} />
              <PropertyRow label="Color" value1={props1.color} value2={props2.color} />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Tooltip content="Export comparison report">
              <button className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-blue-500/40 text-slate-700 dark:text-blue-400 rounded-xl transition-colors flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export Report
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
