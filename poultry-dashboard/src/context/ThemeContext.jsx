import { createContext, useContext, useState, useEffect } from 'react';

/* eslint-disable react-refresh/only-export-components */
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => localStorage.getItem('robofleliss_theme') ?? 'dark');

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('robofleliss_theme', theme);
    }, [theme]);

    const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light');
    return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
