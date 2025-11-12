document.querySelectorAll('input, select, textarea').forEach(field => {
    field.addEventListener('blur', () => {
        field.classList.add('touched');
        if (!field.checkValidity()) {
            field.classList.add('input-error');
        } else {
            field.classList.remove('input-error');
        }
    });
});
