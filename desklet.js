const Desklet = imports.ui.desklet;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Lang = imports.lang;
const Signals = imports.signals;
const Util = imports.misc.util;

const GAMMA_PRECISION = 7;
const GAMMA_CONSTANTS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

const SIMPLE_LAYOUT = [
    [{type: "back"},              {type: "del"},                  {value:"%", type: "execute"}, {value:"add", type: "operate"}],
    [{value:"7", type: "append"}, {value:"8", type: "append"},    {value:"9", type: "append"},  {value:"sub", type: "operate"}],
    [{value:"4", type: "append"}, {value:"5", type: "append"},    {value:"6", type: "append"},  {value:"mult", type: "operate"}],
    [{value:"1", type: "append"}, {value:"2", type: "append"},    {value:"3", type: "append"},  {value:"div", type: "operate"}],
    [{value:"0", type: "append"}, {value:"neg", type: "execute"}, {value:".", type: "append"},  {type: "return"}]
]

const SCIENTIFIC_LAYOUT = [
    [   {type: "back"},
        {type: "del"},
        {type: "reset"},
        {type: "copy"},
        {type: "paste"},
        {value: "inv", type: "updateInv"}],
    [   {type: "opt1"},
        {type: "opt2"},
        {value: "neg", type: "execute"},
        {value: "add", type: "operate"},
        {value: "square", type: "execute", inv: {value: "sqrt", type: "operate"}},
        {value: "sin", type: "operate", inv: {value: "sin-inv", type: "operate"}}],
    [   {value: "7", type: "append"},
        {value: "8", type: "append"},
        {value: "9", type: "append"},
        {value: "sub", type: "operate"},
        {value: "power", type: "operate", inv: {value: "root", type: "operate"}},
        {value: "cos", type: "operate", inv: {value: "cos-inv", type: "operate"}}],
    [   {value: "4", type: "append"},
        {value: "5", type: "append"},
        {value: "6", type: "append"},
        {value: "mult", type: "operate"},
        {value: "log", type: "operate", inv: {value: "10x", type: "operate"}},
        {value: "tan", type: "operate", inv: {value: "tan-inv", type: "operate"}}],
    [   {value: "1", type: "append"},
        {value: "2", type: "append"},
        {value: "3", type: "append"},
        {value: "div", type: "operate"},
        {value: "ln", type: "operate", inv: {value: "ex", type: "operate"}},
        {value: "x!", type: "execute"}],
    [   {value: "0", type: "append"},
        {value: ".", type: "append"},
        {value: "exp", type: "append"},
        {type: "return"},
        {value: "%", type: "execute"},
        {value: "pi", type: "execute"}]
]


let button_path, buffer;


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
        //this.reset();
    },
    
    reset: function(rpn) {
        this.stack = [""];
        this.operations = [];
        this.inv = false;
        this.rpn = rpn;
    },
    
    updateInv: function() {
        this.inv = !this.inv;
        this.emit("status-changed");
    },
    
    updateAngleMode: function(angleMode) {
        this.angleMode = angleMode;
        this.emit("status-changed");
    },
    
    append: function(value) {
        if ( value == "." && (this.stack[this.stack.length-1].indexOf(".") != -1) ) return;
        if ( value == "exp") {
            if ( this.stack[this.stack.length-1].indexOf("e+") != -1 ) return;
            this.stack[this.stack.length-1] += "e+";
        }
        else this.stack[this.stack.length-1] += value;
        
        this.emit("changed");
    },
    
    operate: function(value) {
        if ( this.rpn ) {
            this.execute(value);
            return;
        }
        let multFunc = ["sqrt", "sin", "cos", "tan", "sin-inv", "cos-inv", "tan-inv", "log", "ln", "10x", "ex"];
        if ( this.stack[this.stack.length-1] != "" && multFunc.indexOf(value) != -1 ) this.operations.push("mult");
        this.operations.push(value);
        this.stack.push("");
        this.emit("changed");
    },
    
    execute: function(value) {
        if ( this.rpn && this.stack[this.stack.length-1] == "" ) this.stack.pop();
        let result;
        
        switch ( value ) {
            case "%":
                if ( this.stack[this.stack.length-1] == "" ) return;
                result = String(this.stack.pop()/100);
                break;
            case "neg":
                string = this.stack.pop();
                if ( string[0] == "-" ) string = string.slice(1);
                else string = "-" + string;
                result = string;
                break;
            case "add":
                if ( this.stack.length < 2 ) return;
                result = String(Number(this.stack.pop()) + Number(this.stack.pop()));
                break;
            case "sub":
                if ( this.stack.length < 2 ) return;
                last = Number(this.stack.pop());
                result = String(Number(this.stack.pop()) - last);
                break;
            case "mult":
                if ( this.stack.length < 2 ) return;
                result = String(Number(this.stack.pop()) * Number(this.stack.pop()));
                break;
            case "div":
                if ( this.stack.length < 2 ) return;
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
                power = this.stack.pop();
                result = String(Math.pow(this.stack.pop(), power));
                break;
            case "root":
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
                result = String(Math.asin(input));
                if ( this.angleMode == 0 ) result = result / Math.PI * 180;
                break;
            case "cos-inv":
                input = this.stack.pop();
                result = String(Math.acos(input));
                if ( this.angleMode == 0 ) result = result / Math.PI * 180;
                break;
            case "tan-inv":
                input = this.stack.pop();
                result = String(Math.atan(input));
                if ( this.angleMode == 0 ) result = result / Math.PI * 180;
                break;
            case "x!":
                result = String(gamma(Number(this.stack.pop()) + 1));
                break;
            case "pi":
                if ( !this.rpn ) {
                    if ( this.stack[this.stack.length-1] == "" ) this.stack.pop();
                    else this.operations.push("mult");
                }
                result = String(Math.PI);
        }
        
        this.stack.push(result);
        if ( this.rpn ) this.stack.push("");
        
        this.emit("changed");
    },
    
    solve: function() {
        while ( this.stack.length > 1 ) this.close();
        
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
                else if ( isNaN( string )) string = "";
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
                case "sqrt":
                    this.stack[j] = String(Math.sqrt(value));
                    this.operations.splice(i, 1);
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
        
        this.operations.pop();
        
        this.emit("changed");
    },
    
    copy: function() {
        if ( this.rpn && this.stack[this.stack.length-1] == "" ) this.stack.pop();
        St.Clipboard.get_default().set_text(this.stack[this.stack.length-1]);
        if ( this.rpn ) this.stack.push("");
    },
    
    paste: function() {
        St.Clipboard.get_default().get_text(Lang.bind(this, function(cb, text) {
            if ( !isNaN(text) ) return;
            if ( !this.rpn && this.stack[this.stack.length-1] != "" ) return;
            if ( this.stack[this.stack.length-1] == "" ) this.stack.pop();
            
            this.stack.push(text);
            if ( this.rpn ) this.stack.push("");
        }));
        
        this.emit("changed");
    }
}
Signals.addSignalMethods(Buffer.prototype);


function DisplayBox() {
    this._init();
}

DisplayBox.prototype = {
    _init: function() {
        
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
        
    },
    
    update: function() {
        try {
            
            let last = buffer.stack.length - 1;
            let value = buffer.stack[last];
            if ( value == "" ) value = "0";
            this.value.text = value;
            if ( buffer.stack.length > 1 ) this.valuePrev.text = buffer.stack[last-1];
            else this.valuePrev.text = "";
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


function DisplayBoxRPN() {
    this._init();
}

DisplayBoxRPN.prototype = {
    _init: function() {
        
        this.show = [];
        
        this.actor = new St.BoxLayout({ vertical: false, style_class: "calc-displayWindow-rpn" });
        
        let displayBin = new St.Bin({ x_expand: true, x_fill: true, y_align: St.Align.END });
        this.actor.add(displayBin, { expand: true });
        this.displayBox = new St.BoxLayout({ vertical: true, pack_start: true });
        displayBin.add_actor(this.displayBox);
        
        let navigationBox = new St.BoxLayout({ vertical: true, style_class: "calc-navigation-box" });
        this.actor.add_actor(navigationBox);
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
                
                
                let value = new St.Label({ text: this.stack[i], style_class: "calc-displayText-rpn" });
                row.add_actor(value);
            }
            
            if ( this.start == this.stack.length - 1 ) this.buttonDown.hide();
            else this.buttonDown.show();
            
            if ( this.end == 0 ) this.buttonUp.hide();
            else this.buttonUp.show();
            
        } catch(e) {
            global.logError(e);
        }
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
        
        this.info = info;
        
        this.actor = new St.Button({ style_class: "calc-button" });
        
        let type = info.type;
        let text, command;
        switch ( type ) {
            case "back":
                this.command = "back";
                file = Gio.file_new_for_path(button_path + "delete-symbolic.svg");
                gicon = new Gio.FileIcon({ file: file });
                this.image = new St.Icon({ gicon: gicon, icon_size: 16, icon_type: St.IconType.SYMBOLIC });
                break;
            case "del":
                this.command = "del";
                text = "del";
                this.image;
                break;
            case "reset":
                this.command = "reset";
                file = Gio.file_new_for_path(button_path + "reset-symbolic.svg");
                gicon = new Gio.FileIcon({ file: file });
                this.image = new St.Icon({ gicon: gicon, icon_size: 16, icon_type: St.IconType.SYMBOLIC });
                break;
            case "copy":
                this.command = "copy";
                this.image = new St.Icon({ icon_name: "edit-copy", icon_size: 16, icon_type: St.IconType.SYMBOLIC });
                break;
            case "paste":
                this.command = "paste";
                this.image = new St.Icon({ icon_name: "edit-paste", icon_size: 16, icon_type: St.IconType.SYMBOLIC });
                break;
            case "opt1":
                if ( rpn ) {
                    file = Gio.file_new_for_path(button_path + "swap-symbolic.svg");
                    this.command = "swap";
                }
                else {
                    file = Gio.file_new_for_path(button_path + "popen-symbolic.svg");
                    this.command = "open";
                }
                gicon = new Gio.FileIcon({ file: file });
                this.image = new St.Icon({ gicon: gicon, icon_size: 16, icon_type: St.IconType.SYMBOLIC });
                break;
            case "opt2":
                if ( rpn ) {
                    file = Gio.file_new_for_path(button_path + "recip-symbolic.svg");
                    this.command = "recip";
                }
                else {
                    file = Gio.file_new_for_path(button_path + "pclose-symbolic.svg");
                    this.command = "close";
                }
                gicon = new Gio.FileIcon({ file: file });
                this.image = new St.Icon({ gicon: gicon, icon_size: 16, icon_type: St.IconType.SYMBOLIC });
                break;
            case "return":
                if ( rpn ) {
                    let file = Gio.file_new_for_path(button_path + "return-symbolic.svg");
                    let gicon = new Gio.FileIcon({ file: file });
                    this.image = new St.Icon({ gicon: gicon, icon_size: 16, icon_type: St.IconType.SYMBOLIC });
                    this.command = "push";
                }
                else {
                    let file = Gio.file_new_for_path(button_path + "equal-symbolic.svg");
                    let gicon = new Gio.FileIcon({ file: file });
                    this.image = new St.Icon({ gicon: gicon, icon_size: 16, icon_type: St.IconType.SYMBOLIC });
                    this.command = "solve";
                }
                break;
            default:
                let file = Gio.file_new_for_path(button_path + info.value + "-symbolic.svg");
                let gicon = new Gio.FileIcon({ file: file });
                this.image = new St.Icon({ gicon: gicon, icon_size: 16, icon_type: St.IconType.SYMBOLIC });
                text = info.value;
        }
        
        if ( info.inv ) {
            this.infoInv = info.inv;
            buffer.connect("inv-changed", Lang.bind(this, this.refresh));
            let file = Gio.file_new_for_path(button_path + this.infoInv.value + "-symbolic.svg");
            let gicon = new Gio.FileIcon({ file: file });
            this.imageInv = new St.Icon({ gicon: gicon, icon_size: 16, icon_type: St.IconType.SYMBOLIC });
        }
        
        if ( this.image ) this.actor.add_actor(this.image);
        else this.actor.label = text;
        
        this.actor.connect("clicked", Lang.bind(this, this.execute));
        
    },
    
    refresh: function() {
        if ( buffer.inv ) this.actor.set_child(this.imageInv);
        else this.actor.set_child(this.image);
    },
    
    execute: function() {
        try {
            
            if ( this.command ) buffer[this.command]();
            else if ( this.info.inv && buffer.inv ) buffer[this.info.inv.type](this.info.inv.value);
            else buffer[this.info.type](this.info.value);
            
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
        
        buffer.reset(this.rpn);
        
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
        
        if ( this.rpn ) this.display = new DisplayBoxRPN();
        else this.display = new DisplayBox();
        displayArea.add_actor(this.display.actor);
        
        let buttonTable = new Clutter.TableLayout();
        buttonTable.set_row_spacing(5);
        buttonTable.set_column_spacing(5);
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
}


function main(metadata, desklet_id) {
    let desklet = new myDesklet(metadata, desklet_id);
    return desklet;
}