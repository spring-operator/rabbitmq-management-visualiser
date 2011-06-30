function Model() {
    this.exchange = {};
    this.exchanges_visible = 0;
    this.queue = {};
    this.queues_visible = 0;
    this.connections = {};
    this.channels = {};
};

Model.prototype.permitted_exchanges_visible = 10;
Model.prototype.permitted_queues_visible = 10;

Model.prototype.rebuild = function(tree, configuration) {
    var elem;
    var matched = {};
    for (var i = 0; i < configuration.exchanges.length; ++i) {
        elem = configuration.exchanges[i];
        if (undefined == this.exchange[elem.name]) {
            this.exchange[elem.name] = new Exchange(tree, elem);
            this.exchanges_visible++;
            if (elem.name.slice(0,4) == "amq." ||
                (this.exchanges_visible >
                 this.permitted_exchanges_visible)) {
                this.disable(this.exchange[elem.name], tree);
            }
        } else {
            this.exchange[elem.name].update(elem);
        }
        matched[elem.name] = true;
    }
    for (var i in this.exchange) {
        if (undefined == matched[i]) {
            elem = this.exchange[i];
            delete this.exchange[i];
            elem.remove(tree);
            if (! elem.disabled) {
                this.exchanges_visible--;
            }
        }
    }

    matched = {};
    for (var i = 0; i < configuration.queues.length; ++i) {
        elem = configuration.queues[i];
        if (undefined == this.queue[elem.name]) {
            this.queue[elem.name] = new Queue(tree, elem);
            this.queues_visible++;
            if ((this.queues_visible >
                 this.permitted_queues_visible)) {
                this.disable(this.queue[elem.name], tree);
            }
        } else {
            this.queue[elem.name].update(elem);
        }
        matched[elem.name] = true;
    }
    for (var i in this.queue) {
        if (undefined == matched[i]) {
            elem = this.queue[i];
            delete this.queue[i];
            elem.remove(tree);
            if (! elem.disabled) {
                this.queues_visible--;
            }
        }
    }

    var binding;
    var bindings = {};
    for (var i = 0; i < configuration.bindings.length; ++i) {
        elem = configuration.bindings[i];
        if (undefined == this.exchange[elem.source] ||
            undefined == this[elem.destination_type][elem.destination]) {
            continue;
        }
        if (undefined == bindings[elem.source]) {
            bindings[elem.source] = { exchange : {}, queue : {} };
        }
        var source = bindings[elem.source];
        if (undefined == source[elem.destination_type][elem.destination]) {
            source[elem.destination_type][elem.destination] = new Array(elem);
        } else {
            source[elem.destination_type][elem.destination].push(elem);
        }
    }

    for (var source in bindings) {
        var src = this.exchange[source].bindings_outbound;
        var i = bindings[source];
        for (var destination_type in i) {
            var j = i[destination_type];
            var src1 = src[destination_type];
            for (var destination in j) {
                var dest = this[destination_type][destination].bindings_inbound;
                if (undefined == src1[destination]) {
                    src1[destination] = new Binding(j[destination])
                } else {
                    src1[destination].set(j[destination]);
                }
                binding = src1[destination];
                if (undefined == dest[source]) {
                    dest[source] = binding;
                }
            }
        }
    }
    for (var src in this.exchange) {
        for (var dest_type in this.exchange[src].bindings_outbound) {
            for (var dest in this.exchange[src].bindings_outbound[dest_type]) {
                binding = this.exchange[src].bindings_outbound[dest_type][dest];
                if (undefined == bindings[binding.source] ||
                    undefined == bindings[binding.source][binding.destination_type] ||
                    undefined == bindings[binding.source][binding.destination_type][binding.destination]) {
                    delete this.exchange[src].bindings_outbound[dest_type][dest];
                    delete this[binding.destination_type][binding.destination].bindings_inbound[binding.source];
                }
            }
        }
    }
    bindings = undefined;
    matched = undefined;
};
Model.prototype.disable = function(elem, tree) {
    elem.disable(this);
    tree.del(elem);
    elem.disabled = true;
};
Model.prototype.enable = function(elem, tree) {
    elem.enable(this);
    tree.add(elem);
    elem.disabled = false;
};
Model.prototype.render = function(ctx) {
    for (var i in this.exchange) {
        model.exchange[i].render(this, ctx);
    }
    for (var i in this.queue) {
        model.queue[i].render(this, ctx);
    }
};

function Exchange(tree, elem) {
    this.name = elem.name;
    this.pos = vec3.create();
    this.pos[octtree.x] = this.xInit;
    this.pos[octtree.y] = this.yMax;
    this.pos[octtree.z] = 0;
    Exchange.prototype.yMax += this.yIncr;
    this.next_pos = vec3.create(this.pos);
    this.xMin = this.pos[octtree.x];
    this.xMax = this.pos[octtree.x];
    this.mass = 0.1;
    this.velocity = vec3.create();
    this.ideal = { pos : vec3.create() };
    this.disabled = false;
    this.bindings_outbound = { exchange : {}, queue : {} };
    this.bindings_inbound = {};
    this.update(elem);
    tree.add(this);
};

Exchange.prototype = {
    yTop : 100,
    yMax : 100,
    yIncr : 50,
    xInit : 100,
    xBoundary : 200,
    attributes : [ 'arguments', 'auto_delete', 'durable', 'internal', 'type',
                   'message_stats_out', 'message_stats_in' ],
    pos : vec3.create(),
    fontSize : 12,
    spring : new Spring()
};
Exchange.prototype.spring.octtreeLimit = 10;
Exchange.prototype.spring.octtreeRadius = 500;
Exchange.prototype.spring.equilibriumLength = 0;
Exchange.prototype.spring.dampingFactor = 0.1;
Exchange.prototype.spring.pull = true;
Exchange.prototype.spring.push = false;

Exchange.prototype.canvasResized = function(canvas) {
    Exchange.prototype.xInit = canvas.width / 6;
    Exchange.prototype.xBoundary = 2 * canvas.width / 6;
};
Exchange.prototype.update = function(elem) {
    var attr;
    for (var i = 0; i < this.attributes.length; ++i) {
        attr = this.attributes[i];
        this[attr] = elem[attr];
    }
};
Exchange.prototype.remove = function(tree) {
    tree.del(this);
    Exchange.prototype.yMax = this.yTop;
    for (var i in model.exchange) {
        Exchange.prototype.yMax =
            Math.max(Exchange.prototype.yMax,
                     model.exchange[i].pos[octtree.y] + this.yIncr);
    }
};
Exchange.prototype.render = function(model, ctx) {
    if (this.disabled) {
        return;
    }
    ctx.beginPath();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    var dim = ctx.measureText(this.name);

    ctx.lineWidth = 2.0;
    ctx.strokeStyle = "black";

    ctx.arc(this.pos[octtree.x] - (dim.width / 2), this.pos[octtree.y],
            this.fontSize, Math.PI / 2, 3 * Math.PI / 2, false);
    ctx.lineTo(this.pos[octtree.x] + (dim.width / 2), this.pos[octtree.y]
            - this.fontSize);

    ctx.arc(this.pos[octtree.x] + (dim.width / 2), this.pos[octtree.y],
            this.fontSize, 3 * Math.PI / 2, Math.PI / 2, false);
    ctx.closePath();

    this.preStroke(ctx);

    ctx.beginPath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(this.name, this.pos[octtree.x], this.pos[octtree.y]);

    this.xMin = this.pos[octtree.x] - (dim.width / 2) - this.fontSize;
    this.xMax = this.pos[octtree.x] + (dim.width / 2) + this.fontSize;

    Exchange.prototype.yMax = Math.max(Exchange.prototype.yMax,
                                       this.pos[octtree.y] + this.yIncr);

    for (var i in this.bindings_outbound.exchange) {
        this.bindings_outbound.exchange[i].render(model, ctx);
    }
    for (var i in this.bindings_outbound.queue) {
        this.bindings_outbound.queue[i].render(model, ctx);
    }
};
Exchange.prototype.preStroke = function(ctx) {
};
Exchange.prototype.animate = function(elapsed) {
    if (this.xBoundary > this.pos[octtree.x]) {
        this.ideal.pos[octtree.x] = this.xInit;
        this.ideal.pos[octtree.y] = this.pos[octtree.y];
        this.spring.apply(elapsed, this, this.ideal);
    }
};
Exchange.prototype.disable = function(model) {
    model.exchanges_visible--;
};
Exchange.prototype.enable = function(model) {
    model.exchanges_visible++;
};

function Queue(tree, elem) {
    this.name = elem.name;
    this.pos = vec3.create();
    this.pos[octtree.x] = this.xInit;
    this.pos[octtree.y] = this.yMax;
    this.pos[octtree.z] = 0;
    Queue.prototype.yMax += this.yIncr;

    this.next_pos = vec3.create(this.pos);
    this.xMin = this.pos[octtree.x];
    this.xMax = this.pos[octtree.x];
    this.mass = 0.1;
    this.velocity = vec3.create();
    this.ideal = { pos : vec3.create() };
    this.disabled = false;
    this.bindings_inbound = {};
    this.update(elem);
    tree.add(this);
}

Queue.prototype = {
    yMax : 100,
    yTop : 100,
    yIncr : 50,
    xInit : 400,
    xBoundary : 300,
    attributes : [ 'arguments', 'auto_delete', 'durable', 'messages',
                   'messages_ready', 'messages_unacknowledged', 'message_stats' ],
    pos : vec3.create(),
    fontSize : 12,
    spring : new Spring()
};
Queue.prototype.spring.octtreeLimit = 10;
Queue.prototype.spring.octtreeRadius = 500;
Queue.prototype.spring.equilibriumLength = 0;
Queue.prototype.spring.dampingFactor = 0.1;
Queue.prototype.spring.pull = true;
Queue.prototype.spring.push = false;

Queue.prototype.canvasResized = function(canvas) {
    Queue.prototype.xInit = 5 * canvas.width / 6;
    Queue.prototype.xBoundary = 4 * canvas.width / 6;
};
Queue.prototype.update = function(elem) {
    var attr;
    for (var i = 0; i < this.attributes.length; ++i) {
        attr = this.attributes[i];
        this[attr] = elem[attr];
    }
};
Queue.prototype.remove = function(tree) {
    tree.del(this);
    Queue.prototype.yMax = this.yTop;
    for (var i in model.queue) {
        Queue.prototype.yMax =
            Math.max(Queue.prototype.yMax,
                     model.queue[i].pos[octtree.y] + this.yIncr);
    }
};
Queue.prototype.render = function(model, ctx) {
    if (this.disabled) {
        return;
    }
    ctx.beginPath();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var text = this.name + " (" + this.messages_ready + ", "
            + this.messages_unacknowledged + ")";
    var dim = ctx.measureText(text);

    ctx.lineWidth = 2.0;
    ctx.strokeStyle = "black";
    ctx.moveTo(this.pos[octtree.x] - (dim.width / 2) - this.fontSize,
            this.pos[octtree.y] - this.fontSize);
    ctx.lineTo(this.pos[octtree.x] + (dim.width / 2) + this.fontSize,
            this.pos[octtree.y] - this.fontSize);
    ctx.lineTo(this.pos[octtree.x] + (dim.width / 2) + this.fontSize,
            this.pos[octtree.y] + this.fontSize);
    ctx.lineTo(this.pos[octtree.x] - (dim.width / 2) - this.fontSize,
            this.pos[octtree.y] + this.fontSize);
    ctx.closePath();

    this.preStroke(ctx);

    ctx.beginPath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(text, this.pos[octtree.x], this.pos[octtree.y]);

    this.xMin = this.pos[octtree.x] - (dim.width / 2) - this.fontSize;
    this.xMax = this.pos[octtree.x] + (dim.width / 2) + this.fontSize;

    Queue.prototype.yMax = Math.max(Queue.prototype.yMax,
                                    this.pos[octtree.y] + this.yIncr);
};
Queue.prototype.preStroke = function(ctx) {
};
Queue.prototype.animate = function(elapsed) {
    if (this.xBoundary < this.pos[octtree.x]) {
        this.ideal.pos[octtree.x] = this.xInit;
        this.ideal.pos[octtree.y] = this.pos[octtree.y];
        this.spring.apply(elapsed, this, this.ideal);
    }
};
Queue.prototype.disable = function(model) {
    model.queues_visible--;
};
Queue.prototype.enable = function(model) {
    model.queues_visible++;
};

function Binding(elems) {
    this.keys = {};
    this.set(elems);
    var elem = elems.shift();
    this.source = elem.source;
    this.destination_type = elem.destination_type;
    this.destination = elem.destination;
};
Binding.prototype = {
    attributes : [ 'arguments' ],
    offset : 150,
    fontSize : 12,
    loopOffset : 50
};
Binding.prototype.set = function(elems) {
    this.keys = {};
    for (var i = 0; i < elems.length; ++i) {
        var elem = elems[i];
        this.keys[elem.routing_key] = {};
        var attr;
        for (var j = 0; j < this.attributes.length; ++j) {
            attr = this.attributes[j];
            this.keys[elem.routing_key][attr] = elem[attr];
        }
    }
};
Binding.prototype.render = function(model, ctx) {
    var source = model.exchange[this.source];
    var destination;
    if (this.destination_type == "exchange") {
        destination = model.exchange[this.destination];
    } else {
        destination = model.queue[this.destination];
    }
    if (undefined == source || undefined == destination) {
        return;
    }
    if (source.disabled || destination.disabled) {
        return;
    }
    var xMid = (source.xMax + destination.xMin) / 2;
    var xCtl1 = xMid > (source.xMax + this.offset) ? xMid : source.xMax
            + this.offset;
    var xCtl2 = xMid < (destination.xMin - this.offset) ? xMid
            : destination.xMin - this.offset;
    var yCtl1 = destination == source ? source.pos[octtree.y]
            - this.loopOffset : source.pos[octtree.y];
    var yCtl2 = destination == source ? destination.pos[octtree.y]
            - this.loopOffset : destination.pos[octtree.y];
    ctx.beginPath();
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = "black";
    ctx.moveTo(source.xMax, source.pos[octtree.y]);
    ctx.bezierCurveTo(xCtl1, yCtl1, xCtl2, yCtl2, destination.xMin,
            destination.pos[octtree.y]);
    ctx.moveTo(destination.xMin, destination.pos[octtree.y]+1);
    ctx.bezierCurveTo(xCtl2, yCtl2+1, xCtl1, yCtl1+1, source.xMax,
            source.pos[octtree.y]+1);
    this.preStroke(source, destination, ctx);

    // draw an arrow head
    ctx.beginPath();
    ctx.moveTo(destination.xMin, destination.pos[octtree.y]);
    ctx.lineTo(destination.xMin - this.fontSize, destination.pos[octtree.y]
            + (this.fontSize / 2));
    ctx.lineTo(destination.xMin - this.fontSize, destination.pos[octtree.y]
            - (this.fontSize / 2));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
};
Binding.prototype.preStroke = function(source, destination, ctx) {
};
