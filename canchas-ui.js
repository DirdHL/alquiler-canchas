// Keep FullCalendar aligned with its container when the sidebar changes width.
(() => {
    function setupCalendarSizing() {
        const element = document.getElementById('calendar');
        const container = document.querySelector('.app-container');
        if (!element || !container) return;

        let frame = null;
        let lastWidth = -1;
        function requestSizing() {
            if (frame !== null) return;
            frame = requestAnimationFrame(() => {
                frame = null;
                const width = element.getBoundingClientRect().width;
                if (width <= 0) {
                    lastWidth = -1;
                    return;
                }
                if (Math.abs(width - lastWidth) < 0.5) return;
                if (typeof calendar === 'undefined' || !calendar || typeof calendar.updateSize !== 'function') return;
                lastWidth = width;
                calendar.updateSize();
            });
        }

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(requestSizing);
            observer.observe(element);
        }
        // Also covers the final grid width in browsers without ResizeObserver.
        container.addEventListener('transitionend', event => {
            if (event.target === container && event.propertyName === 'grid-template-columns') requestSizing();
        });
        window.addEventListener('resize', requestSizing);
        requestSizing();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupCalendarSizing, { once: true });
    } else {
        setupCalendarSizing();
    }
})();
