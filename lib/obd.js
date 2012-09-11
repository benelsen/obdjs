var serialport  = require('serialport');
var sys         = require('sys');
var async       = require('async');
var pathExists  = require('fs').existsSync;

var SerialPort = serialport.SerialPort;

SUPPORTED_DEVICE_TYPES = ['ELM327'];

// Class OBD Reader

// default options
var _options = {
  deviceType: 'ELM327',
  serial: {
    baudrate: 38400
  }  
}

OBDReader = function(device, options) {
  options = options || {};
  options.__proto__ = _options;
  
  this.port       = null;
    
  this.device     = device;

  this.deviceType = options.deviceType;
  this.serialOpts = options.serial;

  this.conn       = false;
  this.waiting    = false;
  
  var self = this;
  
  this.queue = async.queue(function(command, callback) {
    self.sendit(command, callback);
  }, 1);
  
  if ( !device ) {
    throw new Error("Must specify a device");
  }
  
  if ( ! pathExists(device) ) {
    throw new Error("Device not found: "+device);
  }
  
  if (SUPPORTED_DEVICE_TYPES.indexOf(options.deviceType) == -1) {
    throw new Error("Unsupported deviceType: " + options.deviceType);
  }
  
  return this;
  
}

OBDReader.prototype.connect = function(callback) {
  if( this.conn ) {
    
    throw new Error("Can't connect, already connected!");
    
  } else {
    
    var port = new SerialPort(this.device,this.serialOpts);

    var self = this;
    port.once('open', function() {
      sys.puts('port open');
      self.conn = true;
      self.port = port;
      if(callback !== undefined) {
        callback();
      }
    });
    
  }
  
}

OBDReader.prototype.disconnect = function(timeout) {
  
  if ( this.conn ) {
  
    var self = this;
    this.port.once('close', function() {
      sys.puts('port closed');
      self.port = null;
      self.conn = false;
    });
    
    if ( this.queue.length() == 0 && this.conn ) {
      this.port.close();
    } else {
      this.queue.drain = function() {
        self.port.close();
      }
    }
    
  } else {
    if ( timeout === undefined ) { timeout = 50; }
    if ( timeout >= 6400 ) {
      throw new Error("No connection after 10 seconds");
    }
    var self = this;
    setTimeout(function(){
      self.disconnect(timeout);
    }, timeout);
    timeout *= 2;
  }

}

OBDReader.prototype.sendit = function(command, callback, timeout) {

  if ( this.conn ) {
    
    //sys.puts("sending...");
    this.port.write(command+'\r');
    
    var called = false;
    res = "";
    var self = this;
    this.port.removeAllListeners("data");
    this.port.on("data", function(buffer){
      
      if ( ! called ) {
        
        var str = buffer.toString('utf8'); // making sure it's a utf8 string, no garbage
        
        if ( str.indexOf('>') > -1 ) {
          res += str.substring( 0, str.indexOf('>') ); // Discard everything after >, no data here
          called = true;
          self.clean(res,callback);
        } else {
          res += str;
        }
        
      }
      
    });
  
  } else {
    if ( timeout === undefined ) { timeout = 50; }
    if ( timeout >= 6400 ) {
      throw new Error("No connection after 10 seconds");
    }
    var self = this;
    setTimeout(function(){
      self.sendit(command, callback, timeout);
    }, timeout);
    timeout *= 2;
  }
  
}

OBDReader.prototype.receiver = function(data) {
  sys.puts("data: " + data);
}

OBDReader.prototype.send = function(command,callback) {
  this.queue.push(command,callback);
}

OBDReader.prototype.clean = function(data, callback) {
  res = data;
  
  matches = res.match(/(.*)[\r\n]+(.*)/i);
  
  res = {
    req: matches[1],
    res: matches[2]
  }
  
  callback(res);
}

var exports = module.exports = OBDReader;
