/*
   Dispatching events isn't as easy as you want it to be.

   While the Dispatcher object (below) is relatively simple, the ruleset
   that determines what to dispatch is a little more complex.

   In a simple case, a object registers for a simple event:

     global_dispatch.listen('page.tick', mytarget);

   When notify() is called with 'page.tick', the `mytarget` object has its
   `setState` method called with whatever arg is passed to the notify()
   method. When the number of 'parts' is equal, this comparison is simple
   the parts must match (or the search must be a '*').

   Thus, 'page.*' would match 'page.tick', but not 'otherthing.tick'.

   While this would be good enough for most cases, we want to avoid
   the following.

     // This is what we want to avoid.
     global_dispatch.listen_fn('user.*.info.id', (payload) => {
        console.log("The ID is: " + payload.info.id);
     });

     // dispatch our complex user object.
     global_dispatch.notify('user.123', {'info':{'id':1}});

     // dispatch a different piece of user data.
     // This would result in an error.
     global_dispatch.notify('user.123', {'other':{'stuff':1}});

   Instead, since we know the search path, we can dig into the payload
   object, and return only what the listener asked for.

   Thus,

     // This is what we actually do.
     global_dispatch.listen_fn('user.*.info.id', (payload) => {
        console.log("The ID is " + payload.id);
     });

     // dispatch our complex user object, the above will be called.
     global_dispatch.notify('user.123', {'info':{'id':1}});

     // dispatch a different piece of user data.
     // This will not invoke the handler above, because the
     // route did not match. See `dispatch_object_to_target`
     global_dispatch.notify('user.123', {'other':{'stuff':1}});

   This avoids nasty bugs, and makes sure that your handlers
   only ever get the data they requested. Handlers can use * at the
   end of their match in order to get all the keys.

   Keep in mind this only works for events that are dictionaries
   or objects.
*/
"use strict";
function dispatch_object_to_target(event, routing_search, payload, target_fn) {
    var sp_event = event.split('.');
    var sp_search = routing_search.split('.');
    var final_payload = payload;
    for (var index = 0; index < sp_search.length; index++) {
        var event_part = sp_event[index];
        var search_part = sp_search[index];
        if (event_part == undefined) {
            if (final_payload[search_part] != undefined) {
                var d = {};
                d[search_part] = final_payload[search_part];
                final_payload = d;
            }
        }
        else if (search_part != '*' && search_part != event_part) {
            return false;
        }
    }
    return target_fn(final_payload);
}
;
// The dispatcher is very similar to the one described in the flux
// documentation: https://facebook.github.io/flux/docs/actions-and-the-dispatcher.html
// This dispatcher is intended to be a singleton (but we don't enforce that)
var Dispatcher = (function () {
    function Dispatcher() {
        this.listeners = [];
        this.event_queue = [];
        this.is_dispatching = false;
        this.function_name = 'setState';
    }
    // Call the `function_name` on the target object. By default
    // this calls setState (which is the norm for React).
    Dispatcher.prototype.listen = function (routing_key, target) {
        var fn_name = this.function_name;
        this.listeners.push([routing_key, function (args) { target[fn_name](args); }]);
    };
    // Listen with a custom function callback.
    Dispatcher.prototype.listen_fn = function (routing_key, target) {
        this.listeners.push([routing_key, target]);
    };
    // Notify listeners that you have data for a key.
    Dispatcher.prototype.notify = function (event_routing_key, args) {
        console.log('notify: ' + event_routing_key + ' with ' + JSON.stringify(args));
        this.event_queue.push([event_routing_key, args]);
        if (this.is_dispatching == false) {
            this.flush_queue();
        }
    };
    Dispatcher.prototype.flush_queue = function () {
        this.is_dispatching = true;
        // lets preserve the current_event queue.
        var inner_queue = this.event_queue;
        // and replace it with an empty queue, that way
        // if events are created during the broadcast of
        // the following events, we cant get into a
        // infinite loop.
        this.event_queue = [];
        while (inner_queue.length) {
            var item = inner_queue.slice(0, 1)[0];
            inner_queue = inner_queue.slice(1);
            this.dispatch_event(item[0], item[1]);
        }
        if (this.event_queue.length > 0) {
            // somewhere in the process of dispatching
            // these events more events came in.
            // lets give the UI thread a chance to render
            // and we'll start dispatching again.
            setTimeout(function () {
                this.flush_queue();
            }, 5);
        }
        else {
            // No other events were created, so we can
            // gracefully stop. Future calls to notify
            // will call flush_queue().
            this.is_dispatching = false;
        }
    };
    // The actual work of dispatching a single event.
    Dispatcher.prototype.dispatch_event = function (event_routing_key, args) {
        var remaining_listeners = [];
        for (var _i = 0, _a = this.listeners; _i < _a.length; _i++) {
            var row = _a[_i];
            var object_routing = row[0];
            var object_target_fn = row[1];
            try {
                // Attempt to dispatch, with some extra rules to dig into objects.
                dispatch_object_to_target(event_routing_key, object_routing, args, object_target_fn);
                // If we make it here, we didn't throw an exception (or we didn't call fn)
                remaining_listeners.push(row);
            }
            catch (e) {
                console.log('Dropping handler for `' + row[0] + '` on `' +
                    typeof row[1].constructor + '` because of exception: ' + e);
            }
        }
        this.listeners = remaining_listeners;
    };
    return Dispatcher;
}());
exports.Dispatcher = Dispatcher;
//# sourceMappingURL=dispatch.js.map