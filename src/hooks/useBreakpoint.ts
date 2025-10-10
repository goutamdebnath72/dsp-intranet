// src/hooks/useBreakpoint.ts
'use client';

import { useState, useEffect } from 'react';

export const useBreakpoint = (breakpoint: number) => {
    const [isAboveBreakpoint, setIsAboveBreakpoint] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            setIsAboveBreakpoint(window.innerWidth >= breakpoint);
        };

        // Set the initial value
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [breakpoint]);

    return isAboveBreakpoint;
};