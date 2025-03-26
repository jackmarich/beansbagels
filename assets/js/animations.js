// Intersection Observer configuration
const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.2
};

// Create the observer instance
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.8s ease-out forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Initialize animations when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Select all elements that need to be animated
    document.querySelectorAll(".section-container, .contact h2, .contact-info").forEach((section) => {
        section.style.opacity = "0";
        section.style.animation = "none";
        observer.observe(section);
    });
}); 