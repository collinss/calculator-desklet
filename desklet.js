const Desklet = imports.ui.desklet;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Lang = imports.lang;


const SIMPLE_LAYOUT_BUTTONS = [
    [{text:"C", type: "reset"},  {text:"CE", type: "clear"},    {text:"%", type: "execute"}, {text:"+", type: "operate"}],
    [{text:"7", type: "append"}, {text:"8", type: "append"},    {text:"9", type: "append"},  {text:"-", type: "operate"}],
    [{text:"4", type: "append"}, {text:"5", type: "append"},    {text:"6", type: "append"},  {text:"*", type: "operate"}],
    [{text:"1", type: "append"}, {text:"2", type: "append"},    {text:"3", type: "append"},  {text:"/", type: "operate"}],
    [{text:"0", type: "append"}, {text:"+/-", type: "execute"}, {text:".", type: "append"},  {text:"=", type: "solve"}]
]


function myDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

myDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,
    
    _init: function(metadata, desklet_id) {
        try {
            
            Desklet.Desklet.prototype._init.call(this, metadata);
            
            this.setHeader(_("Calculator"));
            
            this.mainBox = new St.BoxLayout({ style_class: "mainBox", vertical: true });
            this.setContent(this.mainBox);
            
            this._build_simple_interface();
            
            this.stack = [""];
            this.current = 0;
            this.operating = false;
            
        } catch(e) {
            global.logError(e);
        }
    },
    
    _build_simple_interface: function() {
        this.outputBox = new St.Label({ text: "0", style_class: "displayWindow" });
        let displayArea = new St.BoxLayout({ vertical: true, style_class: "displayArea" });
        displayArea.add_actor(this.outputBox);
        this.mainBox.add_actor(displayArea);
        
        let buttonTable = new Clutter.TableLayout();
        buttonTable.set_row_spacing(5);
        buttonTable.set_column_spacing(5);
        let buttonBox = new Clutter.Actor();
        buttonBox.set_layout_manager(buttonTable);
        this.mainBox.add_actor(buttonBox);
        
        for ( let i = 0; i < SIMPLE_LAYOUT_BUTTONS.length; i++ ) {
            for ( let j = 0; j < SIMPLE_LAYOUT_BUTTONS[i].length; j++ ) {
                let text = SIMPLE_LAYOUT_BUTTONS[i][j].text;
                let type = SIMPLE_LAYOUT_BUTTONS[i][j].type;
                let button = new St.Button({ style_class: "button", label: text });
                button.connect("clicked", Lang.bind(this, function() {
                    this[type](text);
                }));
                buttonTable.pack(button, j, i);
            }
        }
    },
    
    append: function(value) {
        let current = this.stack.length-1;
        this.stack[current] += value;
        
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
                let string = this.stack[this.current]
                if ( string[0] == "-" ) this.stack[this.current] = string.slice(1);
                else this.stack[this.current] = "-" + string;
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
    
    updateDisplay: function() {
        let displayText = this.stack[this.current]
        if ( displayText == "" ) this.outputBox.set_text("0");
        else this.outputBox.set_text(displayText);
    }
}


function main(metadata, desklet_id) {
    let desklet = new myDesklet(metadata, desklet_id);
    return desklet;
}