import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function ImageLightboxModal({ isOpen, src, title = '', onClose }) {
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose?.();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !src) return null;

    return (
        <div
            className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={onClose}
        >
            <div
                className="relative max-w-xl max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl p-2 flex flex-col items-center animate-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg"
                    title="Close"
                >
                    <X size={18} />
                </button>

                <div className="w-full max-h-[78vh] flex items-center justify-center overflow-hidden rounded-2xl bg-slate-950/5">
                    <img
                        src={src}
                        alt={title || 'Product'}
                        className="w-full h-auto max-h-[78vh] object-contain rounded-2xl"
                    />
                </div>

                {title && (
                    <div className="w-full px-4 py-2 text-center">
                        <p className="text-sm font-bold text-slate-800 truncate">{title}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
