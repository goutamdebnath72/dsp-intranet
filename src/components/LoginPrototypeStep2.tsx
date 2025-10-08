'use client';

// NOTE: You would typically reuse the AnimatedInput component, 
// but it's included here so this file is self-contained for prototyping.
const AnimatedInput = ({ id, label, type = "text", isReadOnly = false, autoFocus = false }: any) => {
    return (
        <div className="relative pt-4">
            <label htmlFor={id} className="absolute left-0 -top-1.5 text-sm text-primary-600 font-medium">
                {label}
            </label>
            <input
                id={id}
                type={type}
                readOnly={isReadOnly}
                autoFocus={autoFocus}
                className="w-full bg-transparent px-2 py-1 text-lg tracking-wide text-neutral-800 font-mono border-b-2 border-neutral-300 focus:outline-none focus:border-primary-600 focus:bg-primary-100/50 read-only:bg-neutral-100 read-only:border-neutral-200 read-only:cursor-not-allowed" defaultValue={isReadOnly ? "342461" : ""}
            />
        </div>
    );
};


export const LoginPrototypeStep2 = () => {
    return (
        <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-2xl overflow-hidden min-h-[370px]">
            <div className="flex flex-col h-full">
                <div>
                    <h2 className="mb-2 text-2xl font-bold font-heading text-neutral-800">Enter Password</h2>
                    <p className="h-5 text-red-600"></p> {/* Space for error message */}
                </div>

                <div className="my-auto space-y-8">
                    <AnimatedInput id="ticketNo" label="Ticket Number" isReadOnly={true} />
                    <AnimatedInput id="password" label="SAIL Personal No." type="password" autoFocus={true} />
                </div>

                <button className="mt-auto flex flex-col items-center text-neutral-600 hover:text-primary-600 transition-colors">
                    <span className="font-semibold text-lg">Sign In</span>
                </button>
            </div>
        </div>
    );
};