#     Dispatcher
####  Managing data in your web application.

This readme is not complete, should be updated in a day or two.

----

To be honest, I think you should read the following if you are going to use Dispatcher, it'll help you understand it's goals and make it easier to use.

Every web application has it's components:

    - Rendering (js/html/css, react)
    - State     (js, local storage, backbone, etc)
    - Action    (js)

There are a number of technologies for rendering, both with basic html/css but also with newer frameworks like React.

- [x] Rendering

State is a changing landscape, but the solutions there are still pretty good, indexdb, local_storage, a simple json dictionary, etc.

- [x] storage/state

Action is handled by javascript, which is quickly becoming the assembly language of the internet.

- [x] making things happen.

So everything is solved right? __not quite__

----

Bringing these worlds together can be very difficult, and while React takes care of the state, code and representation of single elements, it doesn't solve the problem of tying together a large application.

Flux, a application architecture by facebook, recommends the following:

> We often pass the entire state of the store down the chain of views in a single object, allowing different descendants to use what they need. In addition to keeping the controller-like behavior at the top of the hierarchy, and thus keeping our descendant views as functionally pure as possible, passing down the entire state of the store in a single object also has the effect of reducing the number of props we need to manage.

While this makes managing your data easier, it doesn't make it very easy to build reusable components. Dispatcher attempts to solve this problem in a very different way.

Additionally, this means every component in your application needs to understand your data model in a pretty specific way. If two pages store information in a different way, it makes things more difficult if you want to use that component elsewhere.

----

#### Events

On a surface level, dispatcher makes sure that your javascript (or react components) are only updated when data they care about changes. Without the need for passing your global state down to each object.

Dispatcher takes care of this with the following:

    dispatcher.listen('state.user.clicks', function(payload) {
        var s = "Clicks: " + (payload.clicks || 0);
        $('#click_counter').html(s);
    });

Whenever the action for `state.user.clicks` is fired, the function defined is called and your dom is updated.

----

#### Complexity

However, the above example hides a significant amount of complexity. A nieve implementation of dispatcher would only match exact events, and that doesn't help us very much.

One complex scenario is when (in the above example) the `state.user` object is fired, perhaps state is set to:

    var state = {
        user: {
            count:   123,
            name:   'graham',
            github: '@graham'
        }
    };

In this case, you want the function defined initially to only receive a dictionary with the count key and value.

Dispatcher does all of this for you, with wild cards for events or attributes you might not be aware of. The goal is to make building large applications out of reuasble components easier.
