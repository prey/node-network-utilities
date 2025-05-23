"use strict";

var os    = require('os'),
    exec  = require('child_process').exec,
    async = require('async');

function trim_exec(cmd, cb) {
  exec(cmd, function(err, out) {
    if (out && out.toString() != '')
      cb(null, out.toString().trim())
    else
      cb(err)
  })
}

function ensure_valid_nic(str) {
  // Allow letters, numbers, -, _, and space
  if (!/^[\w\- ]+$/.test(str))
    throw new Error("Invalid nic name given: " + str);
}

function determine_nic_type(str) {
  return str.match(/Ethernet/)
    ? "Wired"
    : str.match(/Wi-?Fi|AirPort/i)
    ? "Wireless"
    : str.match(/FireWire/)
    ? "FireWire"
    : str.match(/Thunderbolt/)
    ? "Thunderbolt"
    : str.match(/Bluetooth/)
    ? "Bluetooth"
    : str.match(/USB 10\/100\/1000 LAN/)
    ? "USB Ethernet Adapter"
    : "Other";
}

exports.get_active_network_interface_name = function(cb) {
  try {
    var cmd = "netstat -rn | grep UG | awk '{print $NF}'";
    exec(cmd, function(err, stdout) {
      if (err) return cb(err);

      var raw = stdout.toString().trim().split('\n');
      if (raw.length === 0 || (raw.length === 1 && raw[0] === ''))
        return cb(new Error('No active network interface found.'));

      cb(null, raw[0]);
    });
  } catch (e) {
    cb(e);
  }
};

exports.mac_address_for = function(nic_name, cb) {
  try {
    ensure_valid_nic(nic_name);
    var cmd = "networksetup -getmacaddress " + nic_name + " | awk '{print $3}'";
    trim_exec(cmd, cb);
  } catch (e) {
    cb(e);
  }
};

exports.gateway_ip_for = function(nic_name, cb) {
  try {
    ensure_valid_nic(nic_name);
    var cmd = "ipconfig getoption " + nic_name + " router";
    trim_exec(cmd, cb);
  } catch (e) {
    cb(e);
  }
};

exports.netmask_for = function(nic_name, cb) {
  try {
    ensure_valid_nic(nic_name);
    var cmd = "ipconfig getoption " + nic_name + " subnet_mask";
    trim_exec(cmd, cb);
  } catch (e) {
    cb(e);
  }
};

exports.get_network_interfaces_list = function(cb) {

  var count = 0,
      list  = [],
      nics  = os.networkInterfaces();

  function append_data(obj) {
    async.parallel([
      function(cb) {
        exports.gateway_ip_for(obj.name, cb)
      },
      function(cb) {
        exports.netmask_for(obj.name, cb)
      }
    ], function(err, results) {
      if (results[0]) obj.gateway_ip = results[0];
      if (results[1]) obj.netmask    = results[1];      
      list.push(obj);
      --count || cb(null, list);
    })
  }

  exec('networksetup -listallhardwareports', function(err, out) {
    if (err) return cb(err);

    var blocks = out.toString().split(/Hardware/).slice(1);
    count = blocks.length;

    blocks.forEach(function(block) {
      var parts = block.match(/Port: (.+)/),
          mac   = block.match(/Address: ([A-Fa-f0-9:-]+)/),
          name  = block.match(/Device: (\w+)/);
          

      if (!parts || !mac || !name) 
        return --count;

      var obj   = {},
          port  = parts[1];

      obj.name  = name[1];
      obj.type  = determine_nic_type(port);
      obj.ip_address  = null;
      obj.mac_address = mac[1];

      (nics[obj.name] || []).forEach(function(type) {
        if (type.family == 'IPv4') {
          obj.ip_address = type.address;
        }
      });

      append_data(obj);
    })

    if (count == 0)
      cb(new Error('No interfaces found.'))
  })

};
