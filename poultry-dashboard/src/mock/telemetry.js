export const mockTelemetry = {
    // Return the last 60 data points for a single house (1 per minute)
    history: Array.from({ length: 60 }).map((_, i) => {
        const time = new Date();
        time.setMinutes(time.getMinutes() - (59 - i));
        return {
            time: time.toISOString().substring(11, 16), // HH:mm format
            temperature: 28 + Math.sin(i * 0.2) * 1.5 + (Math.random() * 0.4),
            humidity: 60 + Math.cos(i * 0.1) * 5 + (Math.random() * 2),
            ammonia: 15 + (i > 45 ? (i - 45) * 0.4 : 0) + (Math.random() * 1.5) // Spike near end
        };
    })
};
