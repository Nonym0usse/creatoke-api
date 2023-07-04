let User =  {
    email: '',

    set mail(value){
        if (typeof value !== 'string') {
            throw new Error('Name must be a string');
        }
        this.email = value;
    }
}

module.exports = User;
