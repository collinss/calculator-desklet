const Desklet = imports.ui.desklet;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Tooltips = imports.ui.tooltips;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Lang = imports.lang;
const Signals = imports.signals;
const Util = imports.misc.util;

const GAMMA_PRECISION = 7;
const GAMMA_CONSTANTS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

const SIMPLE_LAYOUT = [
    [   {type: "cmd",     value: "back",  tooltip: "Back"},
        {type: "cmd",     value: "reset", tooltip: "Reset"},
        {type: "execute", value: "%"},
        {type: "operate", value: "add"}],
    [   {type: "append",  value: "7"},
        {type: "append",  value: "8"},
        {type: "append",  value: "9"},
        {type: "operate", value: "sub"}],
    [   {type: "append",  value: "4"},
        {type: "append",  value: "5"},
        {type: "append",  value: "6"},
        {type: "operate", value: "mult"}],
    [   {type: "append",  value: "1"},
        {type: "append",  value: "2"},
        {type: "append",  value: "3"},
        {type: "operate", value: "div"}],
    [   {type: "append",  value: "0"},
        {type: "cmd",     value: "neg"},
        {type: "append",  value: "."},
        {type: "return"}]
]

const SCIENTIFIC_LAYOUT = [
    [   {type: "cmd",     value: "back",  tooltip: "Back"},
        {type: "cmd",     value: "del",   tooltip: "Clear entry"},
        {type: "cmd",     value: "reset", tooltip: "Reset"},
        {type: "cmd",     value: "copy",  tooltip: "Copy to clipboard"},
        {type: "cmd",     value: "paste", tooltip: "Paste from clipboard"},
        {type: "cmd",     value: "invUp", tooltip: "Inverse",  inv: {type: "cmd",     value: "invDown"}}],
    [   {type: "opt1"},
        {type: "opt2"},
        {type: "cmd",     value: "neg", tooltip: "Swap sign"},
        {type: "operate", value: "add"},
        {type: "execute", value: "square", inv: {type: "operate", value: "sqrt"}},
        {type: "operate", value: "sin",    inv: {type: "operate", value: "sin-inv"}}],
    [   {type: "append",  value: "7"},
        {type: "append",  value: "8"},
        {type: "append",  value: "9"},
        {type: "operate", value: "sub"},
        {type: "operate", value: "power",  inv: {type: "operate", value: "root"}},
        {type: "operate", value: "cos",    inv: {type: "operate", value: "cos-inv"}}],
    [   {type: "append",  value: "4"},
        {type: "append",  value: "5"},
        {type: "append",  value: "6"},
        {type: "operate", value: "mult"},
        {type: "operate", value: "log",    inv: {type: "operate", value: "10x"}},
        {type: "operate", value: "tan",    inv: {type: "operate", value: "tan-inv"}}],
    [   {type: "append",  value: "1"},
        {type: "append",  value: "2"},
        {type: "append",  value: "3"},
        {type: "operate", value: "div"},
        {type: "operate", value: "ln",     inv: {type: "operate", value: "ex"}},
        {type: "execute", value: "x!"}],
    [   {type: "append",  value: "0"},
        {type: "append",  value: "."},
        {type: "append",  value: "exp", tooltip: "Scientific notation"},
        {type: "return"},
        {type: "execute", value: "%"},
        {type: "cmd",     value: "pi"}]
]


let button_path, buffer;


function factorial(input) {
    if ( input >= 0 && input % 1 == 0 ) {
        let result = 1;
        for ( let i = input; i > 0; i-- ) {
            result = result * i;
        }
        return result;
    }
    else return gamma(input+1);
}


function gamma(input) {

    if ( input < 0.5 ) return Math.PI / (Math.sin(Math.PI * input) * gamma(1 - input));
    else {
        input -= 1;
        
        let x = GAMMA_CONSTANTS[0];
        for ( let i = 1; i < GAMMA_PRECISION + 2; i++ ) x += GAMMA_CONSTANTS[i] / (input + i);
        let t = input + GAMMA_PRECISION + 0.5;
        
        return Math.sqrt(2 * Math.PI) * Math.pow(t, (input + 0.5)) * Math.exp(-t) * x;
    }
}


function Buffer() {
    this._init();
}

Buffer.prototype = {
    _init: function() {
        this.rpn = false;
    },
    
    reset: function() {
        this.stack = [""];
        this.operations = [];
        this.invDown();
        
        this.emit("changed");
    },
    
    invUp: function() {
        this.inv = true;
        this.emit("inv-changed");
    },
    
    invDown: function() {
        this.inv = false;
        this.emit("inv-changed");
    },
    
    updateAngleMode: function(angleMode) {
        this.angleMode = angleMode;
        this.emit("status-changed");
    },
    
    append: function(value) {
        if ( value == "." ) {
            if ( this.stack[this.stack.length-1].indexOf(".") != -1 ) return;
            if ( this.stack[this.stack.length-1] == "" ) this.stack[this.stack.length-1] = "0";
        }
        if ( value == "exp") {
            if ( this.stack[this.stack.length-1].indexOf("e+") != -1 ) return;
            if ( this.stack[this.stack.length-1] == "" ) this.stack[this.stack.length-1] = "1e+"
            else this.stack[this.stack.length-1] += "e+";
        }
        else if ( !isNaN(value) && this.stack[this.stack.length-1] == "0" ) this.stack[this.stack.length-1] = value;
        else this.stack[this.stack.length-1] += value;
        
        this.emit("changed");
    },
    
    operate: function(value) {
        if ( this.rpn ) {
            this.execute(value);
            return;
        }
        
        let dualFunc = ["add", "sub", "mult", "div", "power", "root"];
        let multFunc = ["sqrt", "sin", "cos", "tan", "sin-inv", "cos-inv", "tan-inv", "log", "ln", "10x", "ex"];
        
        if ( this.stack[this.stack.length-1] == "" && dualFunc.indexOf(value) != -1 ) return;
        
        if ( multFunc.indexOf(value) != -1 ) {
            if ( this.stack[this.stack.length-1] != "" ) {
                this.operations.push("mult");
                this.stack.push("");
            }
        }
        else this.stack.push("");
        
        this.operations.push(value);
        this.emit("changed");
    },
    
    execute: function(value) {
        if ( ( !this.rpn && this.stack[this.stack.length-1] == "" ) ||
             ( this.rpn && this.stack[0] == "" ) ) return;
        if ( this.rpn && this.stack[this.stack.length-1] == "" ) this.stack.pop();
        let result;
        
        switch ( value ) {
            case "%":
                if ( this.stack[this.stack.length-1] == "" ) break;
                result = String(this.stack.pop()/100);
                break;
            case "add":
                if ( this.stack.length < 2 ) break;
                result = String(Number(this.stack.pop()) + Number(this.stack.pop()));
                break;
            case "sub":
                if ( this.stack.length < 2 ) break;
                last = Number(this.stack.pop());
                result = String(Number(this.stack.pop()) - last);
                break;
            case "mult":
                if ( this.stack.length < 2 ) break;
                result = String(Number(this.stack.pop()) * Number(this.stack.pop()));
                break;
            case "div":
                if ( this.stack.length < 2 ) break;
                last = Number(this.stack.pop());
                result = String(Number(this.stack.pop()) / last);
                break;
            case "square":
                result = String(Math.pow(this.stack.pop(), 2));
                break;
            case "sqrt":
                result = String(Math.sqrt(this.stack.pop()));
                break;
            case "power":
                if ( this.stack.length < 2 ) break;
                power = this.stack.pop();
                result = String(Math.pow(this.stack.pop(), power));
                break;
            case "root":
                if ( this.stack.length < 2 ) break;
                root = this.stack.pop();
                result = String(Math.pow(this.stack.pop(), 1/root));
                break;
            case "ex":
                result = String(Math.exp(this.stack.pop()));
                break;
            case "ln":
                result = String(Math.log(this.stack.pop()));
                break;
            case "10x":
                result = String(Math.pow(10, this.stack.pop()));
                break;
            case "log":
                result = String(Math.log(this.stack.pop())/Math.log(10));
                break;
            case "sin":
                angle = this.stack.pop();
                if ( this.angleMode == 0 ) angle = angle * Math.PI / 180;
                result = String(Math.sin(angle));
                break;
            case "cos":
                angle = this.stack.pop();
                if ( this.angleMode == 0 ) angle = angle * Math.PI / 180;
                result = String(Math.cos(angle));
                break;
            case "tan":
                angle = this.stack.pop();
                if ( this.angleMode == 0 ) angle = angle * Math.PI / 180;
                result = String(Math.tan(angle));
                break;
            case "sin-inv":
                input = this.stack.pop();
                result = Math.asin(input);
                if ( this.angleMode == 0 ) result = result / Math.PI * 180;
                result = String(result);
                break;
            case "cos-inv":
                input = this.stack.pop();
                result = Math.acos(input);
                if ( this.angleMode == 0 ) result = result / Math.PI * 180;
                result = String(result);
                break;
            case "tan-inv":
                input = this.stack.pop();
                result = Math.atan(input);
                if ( this.angleMode == 0 ) result = result / Math.PI * 180;
                result = String(result);
                break;
            case "x!":
                result = String(factorial(Number(this.stack.pop())));
                break;
        }
        
        if ( result ) this.stack.push(result);
        if ( this.rpn ) this.stack.push("");
        
        this.emit("changed");
    },
    
    solve: function() {
        while ( this.operations.length > 0 ) this.close();
        
        this.emit("changed");
    },
    
    clear: function() {
        this.stack[this.stack.length-1] = "";
        this.emit("changed");
    },
    
    push: function() {
        //if the user has not entered anything in, we want to duplicate the last entry
        if ( this.stack[this.stack.length-1] == "" && this.stack.length-1 > 0 )
            this.stack[this.stack.length-1] = this.stack[this.stack.length-2];
        this.stack.push("");
        
        this.emit("changed");
    },
    
    back: function() {
        if ( this.stack[this.stack.length-1] == "" ) {
            if ( this.rpn && this.stack.length > 1 ) {
                this.stack.pop();
                this.stack.pop();
                this.stack.push("");
            }
            else return;
        }
        else {
            string = this.stack.pop();
            if ( string.length != 0) {
                if ( string.substr(string.length-3, 2) == "e+" ) string = string.substr(0, string.length-2);
                else if ( isNaN( string ) || string.search("Infinity") != -1 ) string = "";
                else string = string.substr(0, string.length-1);
            }
            this.stack.push(string);
        }
        
        this.emit("changed");
    },
    
    del: function() {
        if ( this.rpn && this.stack[this.stack.length-1] == "" ) this.stack.pop();
        this.stack.pop();
        this.stack.push("");
        
        this.emit("changed");
    },
    
    swap: function() {
        if ( this.stack[this.stack.length-1] == "" ) this.stack.pop();
        if ( this.stack.length > 1 ) this.stack.push(String(this.stack.splice(this.stack.length-2,1)));
        this.stack.push("");
        
        this.emit("changed");
    },
    
    recip: function() {
        if ( this.stack[this.stack.length-1] == "" ) this.stack.pop();
        this.stack.push(String(1/this.stack.pop()));
        this.stack.push("");
        
        this.emit("changed");
    },
    
    open: function() {
        if ( this.stack[this.stack.length-1] != "" ) {
            this.stack.push("");
            this.operations.push("mult");
        }
        this.operations.push("popen");
        
        this.emit("changed");
    },
    
    close: function() {
        let stop = 0;
        for ( let i = this.operations.length; i >= 0; i-- ) {
            if ( this.operations[i] == "popen" ) {
                stop = i;
                break;
            }
        }
        
        for ( let i = this.operations.length-1, j = this.stack.length-1; i >= stop; i--, j-- ) {
            let value = this.stack[j];
            switch ( this.operations[i] ) {
                case "sin":
                    if ( this.angleMode == 0 ) value = value * Math.PI / 180;
                    this.stack[j] = String(Math.sin(value));
                    this.operations.splice(i, 1);
                    break;
                case "cos":
                    if ( this.angleMode == 0 ) value = value * Math.PI / 180;
                    this.stack[j] = String(Math.cos(value));
                    this.operations.splice(i, 1);
                    break;
                case "tan":
                    if ( this.angleMode == 0 ) value = value * Math.PI / 180;
                    this.stack[j] = String(Math.tan(value));
                    this.operations.splice(i, 1);
                    break;
                case "sin-inv":
                    angle = Math.asin(value);
                    if ( this.angleMode == 0 ) angle = angle / Math.PI * 180;
                    this.stack[j] = String(angle);
                    break;
                case "cos-inv":
                    angle = Math.acos(value);
                    if ( this.angleMode == 0 ) angle = angle / Math.PI * 180;
                    this.stack[j] = String(angle);
                    break;
                case "tan-inv":
                    angle = Math.atan(value);
                    if ( this.angleMode == 0 ) angle = angle / Math.PI * 180;
                    this.stack[j] = String(angle);
                    break;
                case "sqrt":
                    this.stack[j] = String(Math.sqrt(value));
                    this.operations.splice(i, 1);
                    break;
                case "power":
                    this.stack[j-1] = String(Math.pow(this.stack[j-1], this.stack.splice(j,1)));
                    this.operations.splice(i, 1);
                    break;
                case "root":
                    this.stack[j-1] = String(Math.pow(this.stack.splice(j,1), 1/this.stack[j-1]));
                    this.operations.splice(i, 1);
                    break;
                case "log":
                    this.stack[j] = String(Math.log(this.stack[j])/Math.log(10));
                    this.operations.splice(i, 1);
                    break;
                case "ln":
                    this.stack[j] = String(Math.log(this.stack[j]));
                    this.operations.splice(i, 1);
                    break;
                case "ex":
                    this.stack[j] = String(Math.exp(this.stack[j]));
                    this.operations.splice(i, 1);
                    break;
                case "10x":
                    this.stack[j] = String(Math.pow(10, this.stack[j]));
                    this.operations.splice(i, 1);
                    break;
            }
        }
        
        for ( let i = this.operations.length-1, j = this.stack.length-1; i >= stop; i--, j-- ) {
            let secondVal;
            switch ( this.operations[i] ) {
                case "mult":
                    secondVal = this.stack.splice(j, 1);
                    this.stack[j-1] = String(this.stack[j-1] * secondVal);
                    this.operations.splice(i, 1);
                    break;
                case "div":
                    secondVal = this.stack.splice(j, 1);
                    this.stack[j-1] = String(this.stack[j-1] / secondVal);
                    this.operations.splice(i, 1);
                    break;
            }
        }
        
        for ( let i = this.operations.length-1, j = this.stack.length-1; i >= stop; i--, j-- ) {
            let secondVal;
            switch ( this.operations[i] ) {
                case "add":
                    secondVal = this.stack.splice(j, 1);
                    this.stack[j-1] = String(Number(this.stack[j-1]) + Number(secondVal));
                    this.operations.splice(i, 1);
                    break;
                case "sub":
                    secondVal = this.stack.splice(j, 1);
                    this.stack[j-1] = String(this.stack[j-1] - secondVal);
                    this.operations.splice(i, 1);
                    break;
            }
        }
        
        if ( this.operations.length > 0 ) this.operations.pop();
        
        this.emit("changed");
    },
    
    pi: function() {
        if ( this.stack[this.stack.length-1] == "" ) {
            this.stack.pop();
            this.stack.push(String(Math.PI));
        }
        else {
            this.stack.push(String(this.stack.pop()*Math.PI));
        }
        
        if ( this.rpn ) this.stack.push("");
        
        this.emit("changed");
    },
    
    neg: function() {
        if ( this.rpn && this.stack[this.stack.length-1] == "" ) this.stack.pop();
        
        if ( this.stack.length > 0 ) {
            string = this.stack.pop();
            if ( string[0] == "-" ) string = string.slice(1);
            else string = "-" + string;
            this.stack.push(string);
        }
        
        if ( this.rpn ) this.stack.push("");
        
        this.emit("changed");
    },
    
    copy: function() {
        if ( this.stack[0] == "" ) return;
        if ( this.rpn && this.stack[this.stack.length-1] == "" ) this.stack.pop();
        St.Clipboard.get_default().set_text(this.stack[this.stack.length-1]);
        if ( this.rpn ) this.stack.push("");
    },
    
    paste: function() {
        St.Clipboard.get_default().get_text(Lang.bind(this, function(cb, text) {
            if ( isNaN(Number(text)) ) return;
            if ( !this.rpn && this.stack[this.stack.length-1] != "" ) return;
            if ( this.stack[this.stack.length-1] == "" ) this.stack.pop();
            
            this.stack.push(text);
            if ( this.rpn ) this.stack.push("");
            
            this.emit("changed");
        }));
    }
}
Signals.addSignalMethods(Buffer.prototype);


function DisplayBox(precision) {
    this._init(precision);
}

DisplayBox.prototype = {
    _init: function(precision) {
        
        this.precision = precision;
        
        this.actor = new St.BoxLayout({ vertical: true, style_class: "calc-displayWindow" });
        
        //top line
        let topBox = new St.BoxLayout({ vertical: false });
        this.actor.add_actor(topBox);
        this.status = new St.Label({ style_class: "calc-displayText-status" });
        topBox.add_actor(this.status);
        topBox.add(new St.BoxLayout(), { expand: true });
        this.valuePrev = new St.Label({ style_class: "calc-displayText-secondary" });
        topBox.add_actor(this.valuePrev);
        
        //bottom line
        let bottomBox = new St.BoxLayout({ vertical: false });
        this.actor.add_actor(bottomBox);
        this.operation = new St.Icon({ icon_size: 16, icon_type: St.IconType.SYMBOLIC, style_class: "calc-displayText-operation" });
        bottomBox.add_actor(this.operation);
        bottomBox.add(new St.BoxLayout(), { expand: true });
        this.value = new St.Label({ text: "0", style_class: "calc-displayText-primary" });
        bottomBox.add_actor(this.value);
        
        buffer.connect("changed", Lang.bind(this, this.update));
        buffer.connect("status-changed", Lang.bind(this, this.onStatusChanged));
        buffer.connect("inv-changed", Lang.bind(this, this.onStatusChanged));
        
        this.update();
        
    },
    
    update: function() {
        try {
            
            //primary
            let last = buffer.stack.length - 1;
            let value = buffer.stack[last];
            if ( value == "" ) value = "0";
            else if ( value.length > this.precision ) value = String(Number(value).toPrecision(this.precision));
            this.value.text = value;
            
            //secondary
            if ( buffer.stack.length > 1 ) {
                let prev = buffer.stack[last-1];
                if ( prev.length > this.precision ) prev = String(Number(prev).toPrecision(this.precision));
                this.valuePrev.text = prev;
            }
            else this.valuePrev.text = "";
            
            //operation
            if ( buffer.operations.length > 0 ) {
                let file = Gio.file_new_for_path(button_path + buffer.operations[buffer.operations.length-1] + "-symbolic.svg");
                let gicon = new Gio.FileIcon({ file: file });
                this.operation.gicon = gicon;
            }
            else this.operation.set_icon_name("");
            
            this.onStatusChanged();
            
        } catch (e) {
            global.logError(e);
        }
    },
    
    onStatusChanged: function() {
        let text;
        if ( buffer.angleMode == 0 ) text = "deg";
        else text = "rad";
        
        if ( buffer.inv ) text += " inv";
        
        this.status.text = text;
    }
}


function DisplayBoxRPN(precision) {
    this._init(precision);
}

DisplayBoxRPN.prototype = {
    _init: function(precision) {
        
        this.precision = precision;
        this.show = [];
        
        this.actor = new St.BoxLayout({ vertical: true, style_class: "calc-displayWindow-rpn" });
        
        //status area
        this.status = new St.Label({ style_class: "calc-displayText-status" });
        this.actor.add_actor(this.status);
        
        let bottomBox = new St.BoxLayout({ vertical: false, style_class: "calc-stackArea" });
        this.actor.add_actor(bottomBox);
        
        let displayBin = new St.Bin({ x_expand: true, x_fill: true, y_align: St.Align.END });
        bottomBox.add(displayBin, { expand: true });
        this.displayBox = new St.BoxLayout({ vertical: true, pack_start: true });
        displayBin.add_actor(this.displayBox);
        
        let navigationBox = new St.BoxLayout({ vertical: true, style_class: "calc-navigation-box" });
        bottomBox.add_actor(navigationBox);
        this.buttonUp = new St.Button({ style_class: "calc-navigation-button", visible: false });
        navigationBox.add_actor(this.buttonUp);
        let iconUp = new St.Icon({ icon_name: "go-up", style_class: "calc-navigation-icon" });
        this.buttonUp.set_child(iconUp);
        
        let padding = new St.Bin();
        navigationBox.add(padding, { expand: true });
        
        this.buttonDown = new St.Button({ style_class: "calc-navigation-button", visible: false });
        navigationBox.add_actor(this.buttonDown);
        let iconDown = new St.Icon({ icon_name: "go-down", style_class: "calc-navigation-icon" });
        this.buttonDown.set_child(iconDown);
        
        this.buttonUp.connect("clicked", Lang.bind(this, this.navigateUp));
        this.buttonDown.connect("clicked", Lang.bind(this, this.navigateDown));
        
        buffer.connect("changed", Lang.bind(this, function() { this.update(true); }));
        buffer.connect("status-changed", Lang.bind(this, this.onStatusChanged));
        buffer.connect("inv-changed", Lang.bind(this, this.onStatusChanged));
        
        this.onStatusChanged();
        
    },
    
    update: function(refreshData) {
        try {
            
            this.displayBox.destroy_all_children();
            
            if ( refreshData ) {
                this.stack = buffer.stack.slice(0);
                for ( let i in this.stack ) 
                    if ( this.stack[i] == "" ) this.stack.splice(i, 1);
                this.start = this.stack.length - 1;
                if ( this.stack.length > 4 ) this.end = this.start - 4;
                else this.end = 0;
            }
            
            for ( let i = this.start, j = this.stack.length - this.start; i >= this.end; i--, j++ ) {
                let row = new St.BoxLayout({ vertical: false });
                this.displayBox.add_actor(row);
                
                let index = new St.Label({ text: j + ":", x_expand: true, style_class: "calc-displayText-rpn" });
                row.add(index, { expand: true });
                
                let text = this.stack[i];
                if ( text.length > this.precision ) text = String(Number(text).toPrecision(this.precision));
                let value = new St.Label({ text: text, style_class: "calc-displayText-rpn" });
                row.add_actor(value);
            }
            
            if ( this.start == this.stack.length - 1 ) this.buttonDown.hide();
            else this.buttonDown.show();
            
            if ( this.end == 0 ) this.buttonUp.hide();
            else this.buttonUp.show();
            
            this.onStatusChanged();
            
        } catch(e) {
            global.logError(e);
        }
    },
    
    onStatusChanged: function() {
        let text;
        if ( buffer.angleMode == 0 ) text = "deg";
        else text = "rad";
        text += " rpn";
        if ( buffer.inv ) text += " inv";
        
        this.status.text = text;
    },
    
    navigateUp: function() {
        if ( this.end != 0 ) {
            this.start--;
            this.end--;
        }
        
        this.update(false);
    },
    
    navigateDown: function() {
        if ( this.start != this.stack.length - 1 ) {
            this.start++;
            this.end++;
        }
        
        this.update(false);
    }
}


function Button(info, rpn) {
    this._init(info, rpn);
}

Button.prototype = {
    _init: function(info, rpn) {
        
        switch ( info.type ) {
            case "opt1":
                if ( rpn ) this.info = {type: "cmd", value: "swap", tooltip: "Swap"};
                else this.info = {type: "cmd", value: "open"};
                break;
            case "opt2":
                if ( rpn ) this.info = {type: "cmd", value: "recip", tooltip: "Reciprocal"};
                else this.info = {type: "cmd", value: "close"};
                break;
            case "return":
                if ( rpn ) this.info = {type: "cmd", value: "push"};
                else this.info = {type: "cmd", value: "solve"};
                break;
            default:
                this.info = info;
                break;
        }
        
        this.actor = new St.BoxLayout({ style_class: "calc-button-padding" });
        this.button = new St.Button({ style_class: "calc-button" });
        this.actor.add_actor(this.button);
        
        file = Gio.file_new_for_path(button_path + this.info.value + "-symbolic.svg");
        gicon = new Gio.FileIcon({ file: file });
        this.image = new St.Icon({ gicon: gicon, icon_size: 16, icon_type: St.IconType.SYMBOLIC });
        this.button.add_actor(this.image);
        if ( this.info.tooltip ) new Tooltips.Tooltip(this.button, _(this.info.tooltip));
        
        if ( this.info.inv ) {
            this.infoInv = this.info.inv;
            buffer.connect("inv-changed", Lang.bind(this, this.refresh));
            let file = Gio.file_new_for_path(button_path + this.infoInv.value + "-symbolic.svg");
            let gicon = new Gio.FileIcon({ file: file });
            this.imageInv = new St.Icon({ gicon: gicon, icon_size: 16, icon_type: St.IconType.SYMBOLIC });
        }
        
        this.button.connect("clicked", Lang.bind(this, this.execute));
        
    },
    
    refresh: function() {
        if ( buffer.inv ) this.button.set_child(this.imageInv);
        else this.button.set_child(this.image);
    },
    
    execute: function() {
        try {
            
            let info;
            if ( this.info.inv && buffer.inv ) info = this.infoInv;
            else info = this.info;
            
            if ( info.type == "cmd" ) buffer[info.value]();
            else buffer[info.type](info.value);
            
        } catch(e) {
            global.logError(e);
        }
    }
}


function myDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

myDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,
    
    _init: function(metadata, desklet_id) {
        try {
            
            this.metadata = metadata;
            Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);
            
            this._bindSettings();
            
            this._populateContextMenu();
            
            button_path = this.metadata.path + "/buttons/";
            
            buffer = new Buffer();
            
            this._buildInterface();
            this.setAngleMode(this.angleMode);
            
        } catch(e) {
            global.logError(e);
        }
    },
    
    _bindSettings: function() {
        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], this.instance_id);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, "angleMode", "angleMode", this.setAngleMode);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, "rpn", "rpn", this._buildInterface);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, "layout", "layout", this._buildInterface);
        this.settings.bindProperty(Settings.BindingDirection.IN, "precision", "precision", this.setPrecision)
    },
    
    _populateContextMenu: function() {
        
        this.degMenuItem = new PopupMenu.PopupMenuItem(_("Degrees"));
        this._menu.addMenuItem(this.degMenuItem);
        this.degMenuItem.setShowDot(this.angleMode == 0);
        this.degMenuItem.connect("activate", Lang.bind(this, Lang.bind(this, function() {
            this.angleMode = 0;
            this.setAngleMode();
        })));
        
        this.radMenuItem = new PopupMenu.PopupMenuItem(_("Radians"));
        this._menu.addMenuItem(this.radMenuItem);
        this.radMenuItem.setShowDot(this.angleMode == 1);
        this.radMenuItem.connect("activate", Lang.bind(this, Lang.bind(this, function() {
            this.angleMode = 1;
            this.setAngleMode();
        })));
        
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        this.rpnMenuItem = new PopupMenu.PopupMenuItem("RPN");
        this._menu.addMenuItem(this.rpnMenuItem);
        this.rpnMenuItem.connect("activate", Lang.bind(this, function() {
            this.rpn = !this.rpn;
            this._buildInterface();
        }))
        
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        this.layoutFFMenuItem = new PopupMenu.PopupMenuItem("4-Function");
        this._menu.addMenuItem(this.layoutFFMenuItem);
        this.layoutFFMenuItem.connect("activate", Lang.bind(this, function() {
            this.layout = 1;
            this._buildInterface();
        }));
        
        this.layoutSciMenuItem = new PopupMenu.PopupMenuItem("Scientific");
        this._menu.addMenuItem(this.layoutSciMenuItem);
        this.layoutSciMenuItem.connect("activate", Lang.bind(this, function() {
            this.layout = 2;
            this._buildInterface();
        }));
        
    },
    
    _buildInterface: function() {
        if ( this.mainBox ) this.mainBox.destroy();
        
        buffer.rpn = this.rpn;
        buffer.reset();
        
        let layout;
        
        if ( this.rpn ) this.rpnMenuItem.setShowDot(true);
        else this.rpnMenuItem.setShowDot(false);
        this.layoutFFMenuItem.setShowDot(false);
        this.layoutSciMenuItem.setShowDot(false);
        switch ( this.layout ) {
            case 1:
                layout = SIMPLE_LAYOUT;
                this.layoutFFMenuItem.setShowDot(true);
                break;
            case 2:
                layout = SCIENTIFIC_LAYOUT;
                this.layoutSciMenuItem.setShowDot(true);
                break;
        }
        
        this.mainBox = new St.BoxLayout({ style_class: "calc-mainBox", vertical: true });
        this.setContent(this.mainBox);
        
        let displayArea = new St.BoxLayout({ vertical: true, style_class: "calc-displayArea" });
        this.mainBox.add_actor(displayArea);
        
        if ( this.rpn ) this.display = new DisplayBoxRPN(this.precision);
        else this.display = new DisplayBox(this.precision);
        displayArea.add_actor(this.display.actor);
        
        let buttonTable = new Clutter.TableLayout();
        //buttonTable.set_row_spacing(5);
        //buttonTable.set_column_spacing(5);
        let buttonBox = new Clutter.Actor();
        buttonBox.set_layout_manager(buttonTable);
        this.mainBox.add_actor(buttonBox);
        
        for ( let i = 0; i < layout.length; i++ ) {
            for ( let j = 0; j < layout[i].length; j++ ) {
                buttonInfo = layout[i][j];
                if ( buttonInfo.type == "empty" ) continue;
                let button = new Button(buttonInfo, this.rpn);
                buttonTable.pack(button.actor, j, i);
            }
        }
    },
    
    setAngleMode: function() {
        this.degMenuItem.setShowDot(this.angleMode == 0);
        this.radMenuItem.setShowDot(this.angleMode == 1);
        buffer.updateAngleMode(this.angleMode);
    },
    
    setPrecision: function() {
        this.display.precision = this.precision;
        this.display.update();
    }
}


function main(metadata, desklet_id) {
    let desklet = new myDesklet(metadata, desklet_id);
    return desklet;
}