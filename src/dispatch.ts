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

function dispatch_object_to_target(_dispatcher:Dispatcher, event:string,
                                   routing_search:string, payload:any,
                                   target_fn:any, options:any):any {
    let sp_event:Array<string> = event.split('.');
    let sp_search:Array<string> = routing_search.split('.');
    let final_payload = payload;
    let routing_path = [];
    let last_successful_search_part = null;

    for(let index=0; index < sp_search.length; index++) {
        let event_part = sp_event[index];
        let search_part = sp_search[index];

        if (event_part == undefined) {
            if (search_part == '*') {
                let new_routing_root = routing_path.join('.');
                for(let i in final_payload) {
                    let new_routing = new_routing_root + '.' + i;
                    console.log("new event: " + new_routing);
                    _dispatcher.notify(new_routing, final_payload[i]);
                }
            } else if (final_payload[search_part] != undefined) {
                final_payload = final_payload[search_part];
                last_successful_search_part = search_part;
                routing_path.push(search_part);
            } else {
                return false;
            }
        } else if (search_part != '*' && search_part != event_part) {
            return false;
        } else {
            last_successful_search_part = event_part;
            routing_path.push(event_part);
        }
    }

    if (last_successful_search_part != null) {
        var d: { [id:string] : string} = {};
        d[last_successful_search_part] = final_payload;
        final_payload = d;
    }

    return target_fn(final_payload, routing_path.join('.'));
};


// The dispatcher is very similar to the one described in the flux
// documentation: https://facebook.github.io/flux/docs/actions-and-the-dispatcher.html
// This dispatcher is intended to be a singleton (but we don't enforce that)
class Dispatcher {
    // A O(n) lookup of listeners, kept in order.
    listeners: Array<any>;

    // Events that are pending dispatch.
    event_queue: Array<any>;

    // This helps us keep track of what we are doing and prevents
    // us from infinite looping (along with the queue).
    is_dispatching: boolean;

    // is capturing local storage events. We don't need to track this
    // but it'll make it so more than one call to the method doesn't
    // wrap the event handler unnessicarily.
    is_capturing_local_storage_events: boolean;
    
    // Name of the function on target objects that will be called
    // whenever we receive a event that object is listening for.
    function_name:string;

    constructor() {
        this.listeners = [];
        this.event_queue = [];
        this.is_dispatching = false;
        this.is_capturing_local_storage_events = false;
        this.function_name = 'setState';
    }

    // Call the `function_name` on the target object. By default
    // this calls setState (which is the norm for React).
    listen(routing_key:string, target:any, options:any) {
        let fn_name = this.function_name;
        this.listeners.push([routing_key,
                             function() {
                                 target.setState(arguments[0]);
                             },
                             options
                            ]);
    }

    // Listen with a custom function callback.
    listen_fn(routing_key:string, target:any, options:any) {
        this.listeners.push([routing_key, target, options]);
    }

    // Notify listeners that you have data for a key.
    notify(event_routing_key:string, args:any) {
        if (event_routing_key.indexOf('*') > -1) {
            throw "You can't notify with a *; use flush or broadcast.";
        }
        this.event_queue.push([event_routing_key, args]);
        if (this.is_dispatching == false) {
            this.flush_queue();
        }
    }

    // Broadcast an event to all handlers, regardless of their listening key.
    // This can be used to reset all of your handlers, or to notify them of some
    // other global change.
    broadcast(event:any) {
        for(let obj of this.listeners) {
            let fn = obj[1];
            fn(event, '_');
        }
    }

    // Flush will notify any listener that matches a "startswith" comparison
    // Usage in documentation will give more insight into why you might need this.
    flush(event_routing_key:string, args:any) {
        for(let obj of this.listeners) {
            let fn = obj[1];
            let key = obj[0];
            if (key.substring( 0, event_routing_key.length ) == event_routing_key) {
                fn(args, '-');
            }
        }
    }

    flush_queue() {
        this.is_dispatching = true;
        // lets preserve the current_event queue.
        let inner_queue = this.event_queue;

        // and replace it with an empty queue, that way
        // if events are created during the broadcast of
        // the following events, we cant get into a
        // infinite loop.
        this.event_queue = [];

        while (inner_queue.length) {
            let item = inner_queue.slice(0, 1)[0];
            inner_queue = inner_queue.slice(1);
            this.dispatch_event(item[0], item[1]);
        }

        if (this.event_queue.length > 0) {
            // somewhere in the process of dispatching
            // these events more events came in.
            // lets give the UI thread a chance to render
            // and we'll start dispatching again.
            let _this = this;
            setTimeout(function() {
                _this.flush_queue();
            }, 5);
        } else {
            // No other events were created, so we can
            // gracefully stop. Future calls to notify
            // will call flush_queue().
            this.is_dispatching = false;
        }
    }

    // The actual work of dispatching a single event.
    dispatch_event(event_routing_key:string, args:any) {
        let remaining_listeners:Array<any> = [];

        for(let row of this.listeners) {
            let object_routing:string = row[0];
            let object_target_fn:any = row[1];
            let object_options:any = row[2];

            try {
                // Attempt to dispatch, with some extra rules to dig into objects.
                dispatch_object_to_target(this,
                                          event_routing_key,
                                          object_routing,
                                          args,
                                          object_target_fn,
                                          object_options);

                // If we make it here, we didn't throw an exception (or we didn't call fn)
                remaining_listeners.push(row);
            } catch (e) {
                console.log('Dropping handler for `' + row[0] + '` on `' +
                            typeof row[1].constructor + '` because of exception: ' + e);
            }
        }

        this.listeners = remaining_listeners;
    }

    // Warning, this is here to show you how this might work, but it hides
    // the fact that setItem will clobber complex objects ([], {}) into a
    // string while adding them to the database.
    capture_local_storage_changes() {
        let _this = this;
        if (this.is_capturing_local_storage_events == false) {
            let originalSetItem = localStorage.setItem;
            localStorage.setItem = function(){
                originalSetItem.apply(this, arguments);
                _this.notify(arguments[0], arguments[1]);
            }
            this.is_capturing_local_storage_events = true;
        } else {
            console.log("successive calls to capture_local_storage_changes are ignored.");
        }
    }    
}

export { Dispatcher };
