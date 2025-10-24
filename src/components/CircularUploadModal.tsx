'use client';

import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { X, UploadCloud, File, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import { AnimatedInput } from './AnimatedInput';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onUploadSuccess: (newCircular: any) => void;
};

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

export function CircularUploadModal({ isOpen, onClose, onUploadSuccess }: Props) {
    const [headline, setHeadline] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [errorMessage, setErrorMessage] = useState('');

    const resetState = useCallback(() => {
        setHeadline('');
        setFile(null);
        setPreview(null);
        setStatus('idle');
        setUploadProgress(0);
        setErrorMessage('');
    }, []);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles[0]) {
            const droppedFile = acceptedFiles[0];
            setFile(droppedFile);
            if (droppedFile.type.startsWith('image/')) {
                setPreview(URL.createObjectURL(droppedFile));
            } else {
                setPreview(null);
            }
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/png': ['.png'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'application/pdf': ['.pdf'],
        },
        maxFiles: 1,
    });

    useEffect(() => {
        return () => {
            if (preview) URL.revokeObjectURL(preview);
        };
    }, [preview]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!file || !headline) return;

        setStatus('uploading');
        setErrorMessage('');

        const formData = new FormData();
        formData.append('headline', headline);
        formData.append('file', file);

        try {
            const response = await axios.post('/api/circulars', formData, {
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total ?? 1));
                    setUploadProgress(percentCompleted);
                },
            });

            setStatus('success');
            onUploadSuccess(response.data);
            setTimeout(() => {
                onClose();
                resetState();
            }, 5000);

        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setErrorMessage(err.response?.data?.error || 'An unexpected error occurred.');
        }
    };

    const handleClose = () => {
        if (status !== 'success') {
            resetState();
        }
        onClose();
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={handleClose}
        >
            <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="bg-white/80 backdrop-blur-xl border border-white/30 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* FIX #2: Applied the global .modal-close-button style */}
                <button onClick={handleClose} className="modal-close-button">
                    <X size={28} />
                </button>

                {/* FIX #1: Removed the border-b class to eliminate the white line */}
                <header className="p-6">
                    <h2 className="text-2xl font-bold font-heading text-neutral-800">Post New Circular</h2>
                    <p className="text-neutral-500 mt-1">Upload a headline and file (PDF, JPG, or PNG).</p>
                </header>

                <form onSubmit={handleSubmit} className="p-6 flex-1">
                    <div className="space-y-6">
                        <AnimatedInput
                            id="headline"
                            label="Circular Headline"
                            value={headline}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHeadline(e.target.value)}
                            disabled={status === 'uploading' || status === 'success'}
                            autoFocus={true}
                        />

                        <div
                            {...getRootProps()}
                            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors duration-300 ${isDragActive ? 'border-primary-600 bg-primary-50' : 'border-neutral-300 hover:border-primary-400'}`}
                        >
                            <input {...getInputProps()} />
                            <div className="flex flex-col items-center text-neutral-500">
                                <UploadCloud size={48} className="mb-4 text-neutral-400" />
                                {isDragActive ? (
                                    <p className="text-lg font-semibold text-primary-600">Drop the file here ...</p>
                                ) : (
                                    <p>Drag & drop a file here, or click to select</p>
                                )}
                                <p className="text-sm mt-1">PDF, PNG, JPG up to 10MB</p>
                            </div>
                        </div>

                        <AnimatePresence>
                            {file && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                    <div className="border rounded-lg p-4 flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            {preview ? (
                                                <img src={preview} alt="Preview" className="h-12 w-12 object-cover rounded" />
                                            ) : (
                                                <File className="h-10 w-10 text-neutral-500" />
                                            )}
                                            <div>
                                                <p className="font-semibold text-neutral-700 truncate max-w-xs">{file.name}</p>
                                                <p className="text-sm text-neutral-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                            </div>
                                        </div>
                                        {status !== 'idle' && (
                                            <div className="w-1/3">
                                                {status === 'uploading' && (
                                                    <div className="w-full bg-neutral-200 rounded-full h-2.5">
                                                        <motion.div
                                                            className="bg-primary-600 h-2.5 rounded-full"
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${uploadProgress}%` }}
                                                        />
                                                    </div>
                                                )}
                                                {status === 'success' && <CheckCircle className="text-green-500" />}
                                                {status === 'error' && <AlertCircle className="text-red-500" />}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {status === 'error' && <p className="text-sm text-red-600 text-center">{errorMessage}</p>}
                        {status === 'success' && <p className="text-sm text-green-600 text-center">Upload successful! Closing soon...</p>}
                    </div>

                    <div className="flex justify-end pt-8 mt-auto">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-4 py-2 text-sm font-semibold text-neutral-700 bg-transparent rounded-md hover:bg-neutral-200 transition-colors"
                            disabled={status === 'uploading' || status === 'success'}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="ml-3 px-6 py-2 text-sm font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                            disabled={!file || !headline || status === 'uploading' || status === 'success'}
                        >
                            {status === 'uploading' ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                            {status === 'uploading' ? 'Posting...' : 'Post Circular'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}