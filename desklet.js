const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Lang = imports.lang;
const Util = imports.misc.util;


const UUID = "calculator@scollins";

const SIMPLE_LAYOUT = [
    [{text:"Reset", type: "reset"}, {text:"Clear", type: "clear"}, {text:"%", type: "execute"}, {text:"+", type: "operate"}],
    [{text:"7", type: "append"},    {text:"8", type: "append"},    {text:"9", type: "append"},  {text:"-", type: "operate"}],
    [{text:"4", type: "append"},    {text:"5", type: "append"},    {text:"6", type: "append"},  {text:"*", type: "operate"}],
    [{text:"1", type: "append"},    {text:"2", type: "append"},    {text:"3", type: "append"},  {text:"/", type: "operate"}],
    [{text:"0", type: "append"},    {text:"+/-", type: "execute"}, {text:".", type: "append"},  {text:"=", type: "solve"}]
]

const SIMPLE_LAYOUT_RPN = [
    [{text:"Del", type: "del"},  {text:"Swap", type: "swap"},   {text:"%", type: "execute"}, {text:"+", type: "execute"}],
    [{text:"7", type: "append"}, {text:"8", type: "append"},    {text:"9", type: "append"},  {text:"-", type: "execute"}],
    [{text:"4", type: "append"}, {text:"5", type: "append"},    {text:"6", type: "append"},  {text:"*", type: "execute"}],
    [{text:"1", type: "append"}, {text:"2", type: "append"},    {text:"3", type: "append"},  {text:"/", type: "execute"}],
    [{text:"0", type: "append"}, {text:"+/-", type: "execute"}, {text:".", type: "append"},  {text:"Enter", type: "push"}]
]


function myDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

myDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,
    
    _init: function(metadata, desklet_id) {
        try {
            
            Desklet.Desklet.prototype._init.call(this, metadata);
            
            this._bind_settings(desklet_id);
            this.setHeader(_("Calculator"));
            this._menu.addAction(_("Settings"), function() {
                Util.spawnCommandLine("cinnamon-settings desklets " + UUID);
            });
            
            this._build_interface();
            
        } catch(e) {
            global.logError(e);
        }
    },
    
    _bind_settings: function(instanceId) {
        this.settings = new Settings.DeskletSettings(this, UUID, instanceId);
        this.settings.bindProperty(Settings.BindingDirection.IN, "calcStyle", "calcStyle", this._build_interface);
    },
    
    _build_interface: function() {
        if ( this.mainBox ) this.mainBox.destroy();
        
        this.mainBox = new St.BoxLayout({ style_class: "mainBox", vertical: true });
        this.setContent(this.mainBox);
        this.stack = [""];
        this.current = 0;
        this.operating = false;
        this.rpn = (this.calcStyle == 2);
        
        let displayArea = new St.BoxLayout({ vertical: true, style_class: "displayArea" });
        this.mainBox.add_actor(displayArea);
        this.scrollBox = new St.ScrollView({ style_class: "displayWindow" });
        displayArea.add_actor(this.scrollBox);
        if ( this.rpn ) {
            this.scrollBox.add_style_class_name("rpn");
            this.outputBox = new St.BoxLayout({ vertical: true });
            this.scrollBox.add_actor(this.outputBox);
            this.outputBox.connect("queue_redraw", Lang.bind(this, function() {
                let height = this.outputBox.get_preferred_height(-1)[0] - 60;
                if ( height > 0 ) this.scrollBox.get_vscroll_bar().get_adjustment().set_value(height);
            }));
        }
        else {
            this.outputBox = new St.Label({ text: "0", style_class: "output" });
            let box = new St.BoxLayout({ vertical: true });
            box.add_actor(this.outputBox);
            this.scrollBox.add_actor(box);
        }
        
        let buttonTable = new Clutter.TableLayout();
        buttonTable.set_row_spacing(5);
        buttonTable.set_column_spacing(5);
        let buttonBox = new Clutter.Actor();
        buttonBox.set_layout_manager(buttonTable);
        this.mainBox.add_actor(buttonBox);
        
        let layout;
        switch ( this.calcStyle ) {
            case 1:
                layout = SIMPLE_LAYOUT;
                break;
            case 2:
                layout = SIMPLE_LAYOUT_RPN;
                break;
        }
        
        for ( let i = 0; i < layout.length; i++ ) {
            for ( let j = 0; j < layout[i].length; j++ ) {
                let text = layout[i][j].text;
                let type = layout[i][j].type;
                let button = new St.Button({ style_class: "button", label: text });
                button.connect("clicked", Lang.bind(this, function() {
                    this[type](text);
                }));
                buttonTable.pack(button, j, i);
            }
        }
    },
    
    append: function(value) {
        if ( value == "." && this.stack[this.current].search(".") != -1 ) return;
        this.stack[this.current] += value;
        
        this.updateDisplay();
    },
    
    operate: function(value) {
        if ( this.operating ) this.solve();
        this.operating = true;
        this.operation = value;
        this.stack.push("");
        this.current++;
    },
    
    execute: function(value) {
        switch ( value ) {
            case "%":
                this.stack[this.current] = String(this.stack[this.current]/100);
                break;
            case "+/-":
                if ( this.rpn && this.stack[this.current] == "" ) string = this.stack[this.current-1];
                else string = this.stack[this.current];
                if ( string[0] == "-" ) string = string.slice(1);
                else string = "-" + string;
                if ( this.rpn && this.stack[this.current] == "" ) this.stack[this.current-1] = string;
                else this.stack[this.current] = string;
                break;
            case "+":
                if ( this.stack[this.current] == "" ) this.stack.pop();
                if ( this.stack.length < 2 ) return;
                result = String(Number(this.stack.pop()) + Number(this.stack.pop()));
                this.current = this.stack.push(result, "") - 1;
                break;
            case "-":
                if ( this.stack[this.current] == "" ) this.stack.pop();
                if ( this.stack.length < 2 ) return;
                last = Number(this.stack.pop());
                result = String(Number(this.stack.pop()) - last);
                this.current = this.stack.push(result, "") - 1;
                break;
            case "*":
                if ( this.stack[this.current] == "" ) this.stack.pop();
                if ( this.stack.length < 2 ) return;
                result = String(Number(this.stack.pop()) * Number(this.stack.pop()));
                this.current = this.stack.push(result, "") - 1;
                break;
            case "/":
                if ( this.stack[this.current] == "" ) this.stack.pop();
                if ( this.stack.length < 2 ) return;
                last = Number(this.stack.pop());
                result = String(Number(this.stack.pop()) / last);
                this.current = this.stack.push(result, "") - 1;
                break;
        }
        this.updateDisplay();
    },
    
    solve: function(value) {
        if ( !this.operating || this.stack[this.current] == "" ) return;
        
        let result;
        switch ( this.operation ) {
            case "+":
                result = String(Number(this.stack[this.current-1]) + Number(this.stack.pop()));
                break;
            case "-":
                result = String(Number(this.stack[this.current-1]) - Number(this.stack.pop()));
                break;
            case "*":
                result = String(Number(this.stack[this.current-1]) * Number(this.stack.pop()));
                break;
            case "/":
                result = String(Number(this.stack[this.current-1]) / Number(this.stack.pop()));
                break;
        }
        this.current--;
        this.stack[this.current] = result;
        this.operating = false;
        this.operation = null;
        this.updateDisplay();
    },
    
    clear: function(value) {
        this.stack[this.current] = "";
        this.updateDisplay();
    },
    
    reset: function(value) {
        this.stack = [""];
        this.current = 0;
        this.operating = false;
        this.operation = null;
        this.updateDisplay();
    },
    
    push: function(value) {
        //if the user has not entered anything in, we want to duplicate the last entry
        if ( this.stack[this.current] == "" && this.current > 0 )
            this.stack[this.current] = this.stack[this.current-1];
        this.stack.push("");
        this.current = this.stack.length - 1;
        this.updateDisplay();
    },
    
    del: function(value) {
        if ( this.stack[this.current] == "" ) this.stack.pop();
        if ( this.stack.length > 0 ) this.stack.pop();
        this.stack.push("");
        this.current = this.stack.length - 1;
        this.updateDisplay();
    },
    
    swap: function(value) {
        if ( this.stack[this.current] == "" ) this.stack.pop();
        global.log(this.stack.length);
        if ( this.stack.length > 1 ) this.stack.push(String(this.stack.splice(this.stack.length-2,1)));
        global.log(this.stack.length);
        this.stack.push("");
        this.current = this.stack.length - 1;
        this.updateDisplay();
    },
    
    updateDisplay: function() {
        if ( this.rpn ) {
            this.outputBox.destroy_all_children();
            for ( let i = 0; i < this.stack.length; i++ ) {
                if ( this.stack[i] == "" ) continue;
                let label = new St.Label({ text: this.stack[i], style_class: "output" });
                this.outputBox.add_actor(label);
            }
        }
        else {
            let displayText = this.stack[this.current]
            if ( displayText == "" ) this.outputBox.set_text("0");
            else this.outputBox.set_text(displayText);
        }
    }
}


function main(metadata, desklet_id) {
    let desklet = new myDesklet(metadata, desklet_id);
    return desklet;
}