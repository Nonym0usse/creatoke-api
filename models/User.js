class User {


    constructor(email, password) {
        this.email = email;
        this.password = password;
        return {
            email: this.email,
            password: this.password,
        };
    }
}

module.exports = User;
