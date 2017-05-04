foreman
=======

Foreman moves things around.

## example script

```javascript
module.exports = function iphoneDevices (foreman) {
    let myHash = foreman.scriptHash;
    let myHost = foreman.host;
    let myInstance = foreman.instance;

    foreman
        .pump('firehose')
        .through(filter)
        .to('downstream');

    setTimeout(() => foreman.exit(), 10000); // only run script for 10s

    function filter (msg, cb) {
        if (msg.type === 'something') {
            this.push(msg);
        }
        cb();
    }
};
```

## overview

Foreman contains the following key concepts:

* providers
* labels
* scripts
* sandboxes
* pipelines

You'll see these referenced in the code and in the source filenames. Here's a
brief overview of their purpose:

### provider

A `provider` connects Foreman to the outside world. They implement standard node
streaming API's and handle the details of how data is read to or from an
external system. One provider exists initially - AMQP.

### label

A label is a text string that serves as a source or destination for data. A
script may target a label for input or output without needing to know anything
about the underlying systems. This allows for clean seperation of dev and ops.
On the operations side, a label is associated with a provider and any pertinent
configuration related to that provider. For example, the `firehose` label could
be associated with the AMQP provider, along with additional configuration that
specified routing keys, queue names, the exchange, etc.

### script

A script is a Javascript function that executes within the Foreman process (in a
sandbox described below). Scripts can setup pipelines (described below) and
possibly other things. See the top of this README for an example of what a
script looks like.

### sandbox

Each script executes within it's own sandbox. The scripts do not have access to
the same global object that Foreman itself does. This sandbox implements
wrappers for things like `setTimeout`, `setInterval`, `setImmediate`, as well as
the `clear*` companion functions. Basically anything that can insert something
into the event loop is wrapped and tracked. This allows for clean tear down of
the script and any artifacts at any time, by removing all tracked timers as the
script is removed.

### pipeline

Scripts setup pipelines. Pipelines move data from one label to another, and
possibly through any number of stream processors (filters, maps, etc). All
pipelines setup by a script are tracked and tore down when the script is
stopped/removed. 
