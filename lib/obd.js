var serialport  = require('serialport');
var sys         = require('sys');
var async       = require('async');
var fs          = require('fs');

var SerialPort = serialport.SerialPort;

SUPPORTED_DEVICE_TYPES = ['ELM327'];

// Class OBD Reader

// default options
var _options = {
  deviceType: 'ELM327',
  serial: {
    baudrate: 38400
  }
};

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
  
  if ( ! fs.existsSync(device) ) {
    throw new Error("Device not found: "+device);
  }
  
  if (SUPPORTED_DEVICE_TYPES.indexOf(options.deviceType) == -1) {
    throw new Error("Unsupported deviceType: " + options.deviceType);
  }
  
  return this;
  
};

OBDReader.prototype.connect = function(callback) {
  if( this.conn ) {
    
    throw new Error("Can't connect, already connected!");
    
  } else {
    
    var port = new SerialPort(this.device,this.serialOpts);

    var self = this;
    
    port.once('close', function() {
      sys.puts('port closed');
      self.port = null;
      self.conn = false;
    });
    
    port.once('open', function() {
      sys.puts('port open');
      self.conn = true;
      self.port = port;
      if(callback !== undefined) {
        callback();
      }
    });
      
  }
  
};

OBDReader.prototype.disconnect = function(callback, timeout) {

  var self = this;
  
  if ( ! callback )
    callback = function(){};
  
  if ( this.conn ) {
    
    if ( this.queue.length() === 0 && this.conn ) {
      this.port.close();
      callback();
    } else {
      this.queue.drain = function() {
        self.port.close();
        callback();
      };
    }
    
  } else {
    if ( timeout === undefined ) { timeout = 50; }
    if ( timeout >= 6400 ) {
      throw new Error("No connection after 10 seconds");
    }
    setTimeout(function(){
      self.disconnect(callback, timeout);
    }, timeout);
    timeout *= 2;
  }

};

OBDReader.prototype.sendit = function(command, callback, timeout) {

  var self = this;
  
  if ( this.conn ) {
    
    //sys.puts("sending...");
    this.port.write(command+'\r');
    
    var called = false;
    res = "";
    this.port.removeAllListeners("data");
    this.port.on("data", function(buffer){
      
      if ( ! called ) {
        
        var str = buffer.toString('utf8'); // making sure it's a utf8 string, no garbage
        
        if ( str.indexOf('>') > -1 ) {
          // Discard everything after >, no data here
          res += str.substring( 0, str.indexOf('>') ); 
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
    setTimeout(function(){
      self.sendit(command, callback, timeout);
    }, timeout);
    timeout *= 2;
  }
  
};

OBDReader.prototype.send = function(command,callback) {
  this.queue.push(command,callback);
};

OBDReader.prototype.clean = function(data, callback) {
  
  
  matches = data.match(/(.*)[\r\n]+(.*)/i);
  
  if ( ! matches ) {
        
    callback(new Error());
    
  } else {
    
    data = {
      req: matches[1],
      res: matches[2]
    };
    
    this.route(data, callback);
    
  }
};

OBDReader.prototype.route = function(data, callback) {
  
  // sys.puts(sys.inspect(data));
  
  if ( data.req.toUpperCase().substr(0,2) == 'AT' ) {
    // sys.puts('ELM327 Command');
  } else {
    // sys.puts('OBD Command');
  }
  
  var err = null;
  
  callback(err, data);
  
};

OBDReader.prototype.init = function(callback) {
  this.send("ATZ");
  this.send("ATL1");
  this.send("ATH0");
  this.send("ATS0");
  if (callback) callback();
};

var exports = module.exports = OBDReader;
