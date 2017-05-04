module.exports = function createScriptInterface (foreman) {
    return new ScriptInterface(foreman);
};

function ScriptInterface (foreman) {
    Object.assign(this, {
        createReadStream,
        createWriteStream
    });

    function createReadStream (labelName) {
        return _createStream(foreman, labelName, 'read');
    }

    function createWriteStream (labelName) {
        return _createStream(foreman, labelName, 'write');
    }
}

function _createStream (foreman, labelName, type) {
    const labels = foreman._labels.values();
    const label = Array.from(labels).find(matchingLabel);
    if (!label) {
        throw new UnknownLabelError('unknown label: ' + labelName);
    }

    const match = labelName.match(label.pattern);
    const connection = foreman._connections.acquire(label.uri);

    switch (type) {
      case 'read':
        return connection.createReadStream(label.options, substitute);
      case 'write':
        return connection.createWriteStream(label.options, substitute);
      default:
        throw new Error('stream type must be one of: read, write');
    }


    function matchingLabel (label) {
        return labelName.match(label.pattern);
    }

    // this function supplied as 2nd arg to connection objects
    // _createStream function so that they can easily support
    // positional substitution based on label pattern, for example:
    //   function _createStream (options, substitute) {
    //      const queue = substitute(options.queue);
    //   }
    // If our label pattern is /(.*)-demuxed$/ and we pass '{$1}'
    // as the options.queue value, for the label string 'devices-demuxed'
    // substitute would evaluate queue to be just 'devices'
    function substitute (str) {
        return str.replace(/{\$(\d+)}/, replacement);
    }

    function replacement (_, idx) {
        return match[idx];
    }
}
